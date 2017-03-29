import * as url from "url";
import { EOL } from "os";
import * as helpers from "./helpers";
import * as zlib from "zlib";
import * as util from "util";
import progress = require("progress-stream");
import filesize = require("filesize");
import { HttpStatusCodes } from "./constants";

export class HttpClient implements Server.IHttpClient {
	private defaultUserAgent: string;

	constructor(private $config: Config.IConfig,
		private $logger: ILogger,
		private $proxyService: IProxyService,
		private $staticConfig: Config.IStaticConfig) { }

	async httpRequest(options: any, proxySettings?: IProxySettings): Promise<Server.IResponse> {
		if (_.isString(options)) {
			options = {
				url: options,
				method: "GET"
			};
		}

		let unmodifiedOptions = _.clone(options);

		if (options.url) {
			let urlParts = url.parse(options.url);
			if (urlParts.protocol) {
				options.proto = urlParts.protocol.slice(0, -1);
			}
			options.host = urlParts.hostname;
			options.port = urlParts.port;
			options.path = urlParts.path;
			delete options.url;
		}

		let requestProto = options.proto || "http";
		delete options.proto;
		let body = options.body;
		delete options.body;
		let pipeTo = options.pipeTo;
		delete options.pipeTo;

		const proxyCache = this.$proxyService.getCache();
		let proto = proxyCache ? "http" : requestProto;
		let http = require(proto);

		options.headers = options.headers || {};
		let headers = options.headers;

		await this.useProxySettings(proxySettings, proxyCache, options, headers, requestProto);

		if (!headers.Accept || headers.Accept.indexOf("application/json") < 0) {
			if (headers.Accept) {
				headers.Accept += ", ";
			} else {
				headers.Accept = "";
			}
			headers.Accept += "application/json; charset=UTF-8, */*;q=0.8";
		}

		if (!headers["User-Agent"]) {
			if (!this.defaultUserAgent) {
				//TODO: the user agent client name is also passed explicitly during login and should be kept in sync
				this.defaultUserAgent = util.format("%sCLI/%s (Node.js %s; %s; %s)",
					this.$staticConfig.CLIENT_NAME,
					this.$staticConfig.version,
					process.versions.node, process.platform, process.arch);
				this.$logger.debug("User-Agent: %s", this.defaultUserAgent);
			}

			headers["User-Agent"] = this.defaultUserAgent;
		}

		if (!headers["Accept-Encoding"]) {
			headers["Accept-Encoding"] = "gzip,deflate";
		}

		let result = new Promise<Server.IResponse>((resolve, reject) => {
			let timerId: number;

			let promiseActions: IPromiseActions<Server.IResponse> = {
				resolve,
				reject,
				isResolved: () => false
			};

			if (options.timeout) {
				timerId = setTimeout(() => {
					this.setResponseResult(promiseActions, timerId, { err: new Error(`Request to ${unmodifiedOptions.url} timed out.`) }, );
				}, options.timeout);

				delete options.timeout;
			}

			this.$logger.trace("httpRequest: %s", util.inspect(options));

			let request = http.request(options, (response: Server.IRequestResponseData) => {
				let data: string[] = [];
				let isRedirect = helpers.isResponseRedirect(response);
				let successful = helpers.isRequestSuccessful(response);
				if (!successful) {
					pipeTo = undefined;
				}

				let responseStream = response;
				switch (response.headers["content-encoding"]) {
					case "gzip":
						responseStream = responseStream.pipe(zlib.createGunzip());
						break;
					case "deflate":
						responseStream = responseStream.pipe(zlib.createInflate());
						break;
				}

				if (pipeTo) {
					pipeTo.on("finish", () => {
						this.$logger.trace("httpRequest: Piping done. code = %d", response.statusCode.toString());
						this.setResponseResult(promiseActions, timerId, { response });
					});

					pipeTo = this.trackDownloadProgress(pipeTo);

					responseStream.pipe(pipeTo);
				} else {
					responseStream.on("data", (chunk: string) => {
						data.push(chunk);
					});

					responseStream.on("end", () => {
						this.$logger.trace("httpRequest: Done. code = %d", response.statusCode.toString());
						let responseBody = data.join("");

						if (successful || isRedirect) {
							this.setResponseResult(promiseActions, timerId, { body: responseBody, response });
						} else {
							let errorMessage = this.getErrorMessage(response, responseBody);
							let err: any = new Error(errorMessage);
							err.response = response;
							err.body = responseBody;
							this.setResponseResult(promiseActions, timerId, { err });
						}
					});
				}
			});

			request.on("error", (err: Error) => {
				this.setResponseResult(promiseActions, timerId, { err });
			});

			this.$logger.trace("httpRequest: Sending:\n%s", this.$logger.prepare(body));

			if (!body || !body.pipe) {
				request.end(body);
			} else {
				body.pipe(request);
			}
		});

		let response = await result;

		if (helpers.isResponseRedirect(response.response)) {
			if (response.response.statusCode === HttpStatusCodes.SEE_OTHER) {
				unmodifiedOptions.method = "GET";
			}

			this.$logger.trace("Begin redirected to %s", response.headers.location);
			unmodifiedOptions.url = response.headers.location;
			return await this.httpRequest(unmodifiedOptions);
		}

		return response;
	}

	private async setResponseResult(result: IPromiseActions<Server.IResponse>, timerId: number, resultData: { response?: Server.IRequestResponseData, body?: string, err?: Error }): Promise<void> {
		if (timerId) {
			clearTimeout(timerId);
			timerId = null;
		}

		if (!result.isResolved()) {
			result.isResolved = () => true;
			if (resultData.err) {
				return result.reject(resultData.err);
			}

			let finalResult: any = resultData;
			finalResult.headers = resultData.response.headers;

			result.resolve(finalResult);
		}
	}

	private trackDownloadProgress(pipeTo: NodeJS.WritableStream): NodeJS.ReadableStream {
		// \r for carriage return doesn't work on windows in node for some reason so we have to use it's hex representation \x1B[0G
		let lastMessageSize = 0,
			carriageReturn = "\x1B[0G",
			timeElapsed = 0;

		let progressStream = progress({ time: 1000 }, (progress: any) => {
			timeElapsed = progress.runtime;

			if (timeElapsed >= 1) {
				this.$logger.write("%s%s", carriageReturn, Array(lastMessageSize + 1).join(" "));

				let message = util.format("%sDownload progress ... %s | %s | %s/s",
					carriageReturn,
					Math.floor(progress.percentage) + "%",
					filesize(progress.transferred),
					filesize(progress.speed));

				this.$logger.write(message);
				lastMessageSize = message.length;
			}
		});

		progressStream.on("finish", () => {
			if (timeElapsed >= 1) {
				this.$logger.out("%s%s%s%s", carriageReturn, Array(lastMessageSize + 1).join(" "), carriageReturn, "Download completed.");
			}
		});

		progressStream.pipe(pipeTo);
		return progressStream;
	}

	private getErrorMessage(response: Server.IRequestResponseData, body: string): string {
		if (response.statusCode === HttpStatusCodes.PROXY_AUTHENTICATION_REQUIRED) {
			const clientNameLowerCase = this.$staticConfig.CLIENT_NAME.toLowerCase();
			return `Your proxy requires authentication. You can run ${EOL}\t${clientNameLowerCase} proxy set <hostname> <port> <username> <password>.${EOL}In order to supply ${clientNameLowerCase} with the credentials needed.`;
		} else if (response.statusCode === HttpStatusCodes.PAYMENT_REQUIRED) {
			let subscriptionUrl = util.format("%s://%s/appbuilder/account/subscription", this.$config.AB_SERVER_PROTO, this.$config.AB_SERVER);
			return util.format("Your subscription has expired. Go to %s to manage your subscription. Note: After you renew your subscription, " +
				"log out and log back in for the changes to take effect.", subscriptionUrl);
		} else {
			try {
				let err = JSON.parse(body);

				if (_.isString(err)) {
					return err;
				}

				if (err.ExceptionMessage) {
					return err.ExceptionMessage;
				}
				if (err.Message) {
					return err.Message;
				}
			} catch (parsingFailed) {
				return `The server returned unexpected response: ${parsingFailed.toString()}`;
			}

			return body;
		}
	}

	/**
	 * This method respects the proxySettings (or proxyCache) by modifying headers and options passed to http(s) module.
	 * @param {IProxySettings} proxySettings The settings passed for this specific call.
	 * @param {IProxyCache} proxyCache The globally set proxy for this CLI.
	 * @param {any}options The object that will be passed to http(s) module.
	 * @param {any} headers Headers of the current request.
	 * @param {string} requestProto The protocol used for the current request - http or https.
	 */
	private async useProxySettings(proxySettings: IProxySettings, proxyCache: IProxyCache, options: any, headers: any, requestProto: string): Promise<void> {
		if (proxySettings || proxyCache) {
			options.path = requestProto + "://" + options.host + options.path;
			headers.Host = options.host;
			options.host = (proxySettings && proxySettings.hostname) || proxyCache.PROXY_HOSTNAME;
			options.port = (proxySettings && proxySettings.port) || proxyCache.PROXY_PORT;

			const proxyCredentials = await this.$proxyService.getCredentials();
			if (proxyCredentials && proxyCredentials.username && proxyCredentials.password) {
				headers["Proxy-Authorization"] = "Basic " + new Buffer(`${proxyCredentials.username}:${proxyCredentials.password}`).toString('base64');
			}

			this.$logger.trace("Using proxy with host: %s, port: %d, path is: %s", options.host, options.port, options.path);
		}
	}
}
$injector.register("httpClient", HttpClient);

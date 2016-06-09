///<reference path=".d.ts"/>
"use strict";
import Future = require("fibers/future");
import * as prompt from "inquirer";
import * as helpers from "./helpers";
import * as readline from "readline";
let MuteStream = require("mute-stream");

export class Prompter implements IPrompter {
	private ctrlcReader: readline.ReadLine;
	private muteStreamInstance: any = null;

	constructor() {
		prompt.message = "";
		prompt.delimiter = ":";
		prompt.colors = false;
		prompt.isDefaultValueEditable = true;
	}

	public dispose() {
		if (this.ctrlcReader) {
			this.ctrlcReader.close();
		}
	}

	public get(schemas: IPromptSchema[]): IFuture<any> {
		return (() => {
			try {
				this.muteStdout();

				let future = new Future;
				if (!helpers.isInteractive()) {
					if (_.some(schemas, s => !s.default)) {
						future.throw(new Error("Console is not interactive and no default action specified."));
					} else {
						let result: any = {};

						_.each(schemas, s => {
							// Curly brackets needed because s.default() may return false and break the loop
							result[s.name] = s.default();
						});

						future.return(result);
					}
				} else {
					prompt.prompt(schemas, (result: any) => {
						if(result) {
							future.return(result);
						} else {
							future.throw(new Error(`Unable to get result from prompt: ${result}`));
						}
					});
				}
				return future.wait();
			} finally {
				this.unmuteStdout();
			}
		}).future<any>()();
	}

	public getPassword(prompt: string, options?: IAllowEmpty): IFuture<string> {
		return (() => {
			let schema: IPromptSchema = {
				message: prompt,
				type: "password",
				name: "password",
				validate: (value: any) => {
					let allowEmpty = options && options.allowEmpty;
					return (!allowEmpty && !value) ? "Password must be non-empty" : true;
				}
			};

			let result = this.get([schema]).wait();
			return result.password;
		}).future<string>()();
	}

	public getString(prompt: string, options?: IPrompterOptions): IFuture<string> {
		return (() => {
			let schema: IPromptSchema = {
				message: prompt,
				type: "input",
				name: "inputString",
				validate: (value: any) => {
					let doesNotAllowEmpty = options && _.has(options, "allowEmpty") && !options.allowEmpty;
					return (doesNotAllowEmpty && !value) ? `${prompt} must be non-empty` : true;
				},
				default: options && options.defaultAction
			};

			let result = this.get([schema]).wait();
			return result.inputString;
		}).future<string>()();
	}

	public promptForChoice(promptMessage: string, choices: any[]): IFuture<string> {
		return (() => {
			let schema: IPromptSchema = {
				message: promptMessage,
				type: "list",
				name: "userAnswer",
				choices: choices
			};

			let result = this.get([schema]).wait();
			return result.userAnswer;
		}).future<string>()();
	}

	public confirm(prompt: string, defaultAction?: () => boolean): IFuture<boolean> {
		return ((): boolean => {
			let schema = {
				type: "confirm",
				name: "prompt",
				default: defaultAction,
				message: prompt
			};

			let result = this.get([schema]).wait();
			return result.prompt;
		}).future<boolean>()();
	}

	private muteStdout(): void {
		if (helpers.isInteractive()) {
			process.stdin.setRawMode(true); // After setting rawMode to true, Ctrl+C doesn't work for non node.js events loop i.e device log command

			// We need to create mute-stream and to pass it as output to ctrlcReader
			// This will prevent the prompter to show the user's text twice on the console
			this.muteStreamInstance = new MuteStream();
			this.muteStreamInstance.pipe(process.stdout);
			this.muteStreamInstance.mute();

			this.ctrlcReader = readline.createInterface(<any>{
				input: process.stdin,
				output: this.muteStreamInstance
			});

			this.ctrlcReader.on("SIGINT", () => process.exit());
		}
	}

	private unmuteStdout(): void {
		if (helpers.isInteractive()) {
			process.stdin.setRawMode(false);
			if(this.muteStreamInstance) {
				this.muteStreamInstance.unmute();
				this.muteStreamInstance = null;
				this.dispose();
			}
		}
	}
}
$injector.register("prompter", Prompter);

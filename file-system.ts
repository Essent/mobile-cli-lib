import * as fs from "fs";
import Future = require("fibers/future");
import * as path from "path";
import * as minimatch from "minimatch";
import * as injector from "./yok";
import * as crypto from "crypto";
import * as shelljs from "shelljs";

// TODO: Add .d.ts for mkdirp module (or use it from @types repo).
const mkdirp = require("mkdirp");

@injector.register("fs")
export class FileSystem implements IFileSystem {
	private static DEFAULT_INDENTATION_CHARACTER = "\t";
	private static JSON_OBJECT_REGEXP = new RegExp(`{\\r*\\n*(\\W*)"`, "m");

	constructor(private $injector: IInjector) { }

	//TODO: try 'archiver' module for zipping
	public zipFiles(zipFile: string, files: string[], zipPathCallback: (path: string) => string): IFuture<void> {
		//we are resolving it here instead of in the constructor, because config has dependency on file system and config shouldn't require logger
		let $logger = this.$injector.resolve("logger");
		let zipstream = require("zipstream");
		let zip = zipstream.createZip({ level: 9 });
		let outFile = fs.createWriteStream(zipFile);
		zip.pipe(outFile);

		let result = new Future<void>();
		outFile.on("error", (err: Error) => result.throw(err));

		let fileIdx = -1;
		let zipCallback = () => {
			fileIdx++;
			if (fileIdx < files.length) {
				let file = files[fileIdx];

				let relativePath = zipPathCallback(file);
				relativePath = relativePath.replace(/\\/g, "/");
				$logger.trace("zipping as '%s' file '%s'", relativePath, file);

				zip.addFile(
					fs.createReadStream(file),
					{ name: relativePath },
					zipCallback);
			} else {
				outFile.on("finish", () => result.return());

				zip.finalize((bytesWritten: number) => {
					$logger.debug("zipstream: %d bytes written", bytesWritten);
					outFile.end();
				});
			}
		};
		zipCallback();

		return result;
	}

	public unzip(zipFile: string, destinationDir: string, options?: { overwriteExisitingFiles?: boolean; caseSensitive?: boolean },
		fileFilters?: string[]): IFuture<void> {
		return (() => {
			let shouldOverwriteFiles = !(options && options.overwriteExisitingFiles === false);
			let isCaseSensitive = !(options && options.caseSensitive === false);
			let $hostInfo = this.$injector.resolve("$hostInfo");

			this.createDirectory(destinationDir);

			let proc: string;
			if ($hostInfo.isWindows) {
				proc = path.join(__dirname, "resources/platform-tools/unzip/win32/unzip");
			} else if ($hostInfo.isDarwin) {
				proc = "unzip"; // darwin unzip is info-zip
			} else if ($hostInfo.isLinux) {
				proc = "unzip"; // linux unzip is info-zip
			}

			if (!isCaseSensitive) {
				zipFile = this.findFileCaseInsensitive(zipFile);
			}

			let args = _.flatten<string>(["-b",
				shouldOverwriteFiles ? "-o" : "-n",
				isCaseSensitive ? [] : "-C",
				zipFile,
				fileFilters || [],
				"-d",
				destinationDir]);

			let $childProcess = this.$injector.resolve("childProcess");
			$childProcess.spawnFromEvent(proc, args, "close", { stdio: "ignore", detached: true }).wait();
		}).future<void>()();
	}

	private findFileCaseInsensitive(file: string): string {
		let dir = path.dirname(file);
		let basename = path.basename(file);
		let entries = this.readDirectory(dir);
		let match = minimatch.match(entries, basename, { nocase: true, nonegate: true, nonull: true })[0];
		let result = path.join(dir, match);
		return result;
	}

	public exists(path: string): boolean {
		return fs.existsSync(path);
	}

	public deleteFile(path: string): void {
		try {
			fs.unlinkSync(path);
		} catch (err) {
			if (err && err.code !== "ENOENT") {  // ignore "file doesn't exist" error
				throw (err);
			}
		}
	}

	public deleteDirectory(directory: string): void {
		shelljs.rm("-rf", directory);

		const err = shelljs.error();

		if (err !== null) {
			throw new Error(err);
		}
	}

	public getFileSize(path: string): number {
		let stat = this.getFsStats(path);
		return stat.size;
	}

	public futureFromEvent(eventEmitter: any, event: string): IFuture<any> {
		let future = new Future();
		eventEmitter.once(event, function () {
			let args = _.toArray(arguments);

			if (event === "error") {
				let err = <Error>args[0];
				future.throw(err);
				return;
			}

			switch (args.length) {
				case 0:
					future.return();
					break;
				case 1:
					future.return(args[0]);
					break;
				default:
					future.return(args);
					break;
			}
		});
		return future;
	}

	public createDirectory(path: string): void {
		mkdirp.sync(path);
	}

	public readDirectory(path: string): string[] {
		return fs.readdirSync(path);
	}

	public readFile(filename: string, options?: IReadFileOptions): string | NodeBuffer {
		return fs.readFileSync(filename, options);
	}

	public readText(filename: string, options?: IReadFileOptions | string): string {
		options = options || { encoding: "utf8" };

		if (_.isString(options)) {
			options = { encoding: options };
		}

		if (!options.encoding) {
			options.encoding = "utf8";
		}

		return <string>this.readFile(filename, options);
	}

	public readJson(filename: string, encoding?: string): any {
		let data = this.readText(filename, encoding);
		if (data) {
			// Replace BOM from the header of the file if it exists
			return JSON.parse(data.replace(/^\uFEFF/, ""));
		}
		return null;
	}

	public writeFile(filename: string, data: string | NodeBuffer, encoding?: string): void {
		this.createDirectory(path.dirname(filename));
		fs.writeFileSync(filename, data, { encoding: encoding });
	}

	public appendFile(filename: string, data: any, encoding?: string): void {
		fs.appendFileSync(filename, data, { encoding: encoding });
	}

	public writeJson(filename: string, data: any, space?: string, encoding?: string): void {
		if (!space) {
			space = this.getIndentationCharacter(filename);
		}

		return this.writeFile(filename, JSON.stringify(data, null, space), encoding);
	}

	public copyFile(sourceFileName: string, destinationFileName: string): void {
		if (path.resolve(sourceFileName) === path.resolve(destinationFileName)) {
			return;
		}

		this.createDirectory(path.dirname(destinationFileName));

		shelljs.cp("-f", sourceFileName, destinationFileName);

		const err = shelljs.error();

		if (err) {
			throw new Error(err);
		}
	}

	public createReadStream(path: string, options?: {
		flags?: string;
		encoding?: string;
		fd?: string;
		mode?: number;
		bufferSize?: number;
	}): NodeJS.ReadableStream {
		return fs.createReadStream(path, options);
	}

	public createWriteStream(path: string, options?: {
		flags?: string;
		encoding?: string;
		string?: string;
	}): any {
		return fs.createWriteStream(path, options);
	}

	public chmod(path: string, mode: any): void {
		fs.chmodSync(path, mode);
	}

	public getFsStats(path: string): fs.Stats {
		return fs.statSync(path);
	}


	public getLsStats(path: string): fs.Stats {
		return fs.lstatSync(path);
	}

	public getUniqueFileName(baseName: string): string {
		if (!this.exists(baseName)) {
			return baseName;
		}
		let extension = path.extname(baseName);
		let prefix = path.basename(baseName, extension);

		for (let i = 2; ; ++i) {
			let numberedName = prefix + i + extension;
			if (!this.exists(numberedName)) {
				return numberedName;
			}
		}
	}

	public isEmptyDir(directoryPath: string): boolean {
		let directoryContent = this.readDirectory(directoryPath);
		return directoryContent.length === 0;
	}

	public isRelativePath(p: string): boolean {
		let normal = path.normalize(p);
		let absolute = path.resolve(p);
		return normal !== absolute;
	}

	public ensureDirectoryExists(directoryPath: string): void {
		if (!this.exists(directoryPath)) {
			this.createDirectory(directoryPath);
		}
	}

	public rename(oldPath: string, newPath: string): void {
		fs.renameSync(oldPath, newPath);
	}

	public renameIfExists(oldPath: string, newPath: string): boolean {
		try {
			this.rename(oldPath, newPath);
			return true;
		} catch (e) {
			if (e.code === "ENOENT") {
				return false;
			}
			throw e;
		}
	}

	public symlink(sourcePath: string, destinationPath: string, type?: string): void {
		fs.symlinkSync(sourcePath, destinationPath, type);
	}

	public setCurrentUserAsOwner(path: string, owner: string): IFuture<void> {
		return (() => {
			let $childProcess = this.$injector.resolve("childProcess");

			if (!this.$injector.resolve("$hostInfo").isWindows) {
				let chown = $childProcess.spawn("chown", ["-R", owner, path],
					{ stdio: "ignore", detached: true });
				this.futureFromEvent(chown, "close").wait();
			}
			// nothing to do on Windows, as chown does not work on this platform
		}).future<void>()();
	}

	// filterCallback: function(path: String, stat: fs.Stats): Boolean
	public enumerateFilesInDirectorySync(directoryPath: string,
		filterCallback?: (_file: string, _stat: IFsStats) => boolean,
		opts?: { enumerateDirectories?: boolean, includeEmptyDirectories?: boolean }, foundFiles?: string[]): string[] {
		foundFiles = foundFiles || [];

		if (!this.exists(directoryPath)) {
			let $logger = this.$injector.resolve("logger");
			$logger.warn('Could not find folder: ' + directoryPath);
			return foundFiles;
		}

		let contents = this.readDirectory(directoryPath);
		for (let i = 0; i < contents.length; ++i) {
			let file = path.join(directoryPath, contents[i]);
			let stat = this.getFsStats(file);
			if (filterCallback && !filterCallback(file, stat)) {
				continue;
			}

			if (stat.isDirectory()) {
				if (opts && opts.enumerateDirectories) {
					foundFiles.push(file);
				}
				if (opts && opts.includeEmptyDirectories && this.readDirectory(file).length === 0) {
					foundFiles.push(file);
				}

				this.enumerateFilesInDirectorySync(file, filterCallback, opts, foundFiles);
			} else {
				foundFiles.push(file);
			}
		}
		return foundFiles;
	}

	public getFileShasum(fileName: string, options?: { algorithm?: string, encoding?: string }): IFuture<string> {
		let future = new Future<string>();
		let algorithm = (options && options.algorithm) || "sha1";
		let encoding = (options && options.encoding) || "hex";
		let logger: ILogger = this.$injector.resolve("$logger");
		let shasumData = crypto.createHash(algorithm);
		let fileStream = this.createReadStream(fileName);
		fileStream.on("data", (data: NodeBuffer | string) => {
			shasumData.update(data);
		});

		fileStream.on("end", () => {
			let shasum: string = shasumData.digest(encoding);
			logger.trace(`Shasum of file ${fileName} is ${shasum}`);
			future.return(shasum);
		});

		fileStream.on("error", (err: Error) => {
			future.throw(err);
		});

		return future;
	}

	public readStdin(): IFuture<string> {
		let future = new Future<string>();
		let buffer = '';
		process.stdin.on('data', (data: string) => buffer += data);
		process.stdin.on('end', () => future.return(buffer));
		return future;
	}

	public rm(options?: string, ...files: string[]): void {
		shelljs.rm(options, files);
	}

	public deleteEmptyParents(directory: string): void {
		let parent = this.exists(directory) ? directory : path.dirname(directory);

		while (this.isEmptyDir(parent)) {
			this.deleteDirectory(parent);
			parent = path.dirname(parent);
		}
	}

	private getIndentationCharacter(filePath: string): string {
		if (!this.exists(filePath)) {
			return FileSystem.DEFAULT_INDENTATION_CHARACTER;
		}

		let fileContent = this.readText(filePath).trim();
		let matches = fileContent.match(FileSystem.JSON_OBJECT_REGEXP);

		if (!matches || !matches[1]) {
			return FileSystem.DEFAULT_INDENTATION_CHARACTER;
		}

		let indentation = matches[1];

		return indentation[0] === " " ? indentation : FileSystem.DEFAULT_INDENTATION_CHARACTER;
	}
}

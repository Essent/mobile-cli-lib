export class ProgressIndicator implements IProgressIndicator {
	constructor(private $logger: ILogger) { }

	public async showProgressIndicator<T>(promise: Promise<T>, timeout: number, options?: { surpressTrailingNewLine?: boolean }): Promise<T> {
		let surpressTrailingNewLine = options && options.surpressTrailingNewLine;

		let isResolved = false;

		const tempPromise = new Promise<T>((resolve, reject) => {
			promise.then((res) => {
				isResolved = true;
				resolve(res);
			}, (err) => {
				isResolved = true;
				reject(err);
			});
		});

		while (!isResolved) {
			await this.$logger.printMsgWithTimeout(".", timeout);
		}

		if (!surpressTrailingNewLine) {
			this.$logger.out();
		}

		return tempPromise;
	}
}
$injector.register("progressIndicator", ProgressIndicator);

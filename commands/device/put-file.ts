export class PutFileCommand implements ICommand {
	constructor(private $devicesService: Mobile.IDevicesService,
		private $stringParameter: ICommandParameter,
		private $options: ICommonOptions,
		private $project: Project.IProjectBase,
		private $errors: IErrors) { }

	allowedParameters: ICommandParameter[] = [this.$stringParameter, this.$stringParameter, this.$stringParameter];

	public async execute(args: string[]): Promise<void> {
		await this.$devicesService.initialize({ deviceId: this.$options.device, skipInferPlatform: true });
		let appIdentifier = args[2];

		if (!appIdentifier && !this.$project.projectData) {
			this.$errors.failWithoutHelp("Please enter application identifier or execute this command in project.");
		}

		appIdentifier = appIdentifier || this.$project.projectData.AppIdentifier;
		let action = (device: Mobile.IDevice) => device.fileSystem.putFile(args[0], args[1], appIdentifier);
		await this.$devicesService.execute(action);
	}
}
$injector.registerCommand(["device|put-file", "devices|put-file"], PutFileCommand);

export class StopApplicationOnDeviceCommand implements ICommand {

	constructor(private $devicesService: Mobile.IDevicesService,
		private $stringParameter: ICommandParameter,
		private $options: ICommonOptions) { }

	allowedParameters: ICommandParameter[] = [this.$stringParameter, this.$stringParameter];

	public async execute(args: string[]): Promise<void> {
		await this.$devicesService.initialize({ deviceId: this.$options.device, skipInferPlatform: true, platform: args[1] });

		let action = (device: Mobile.IDevice) => device.applicationManager.stopApplication(args[0]);
		await this.$devicesService.execute(action);
	}
}

$injector.registerCommand(["device|stop", "devices|stop"], StopApplicationOnDeviceCommand);

export class UserSettingsServiceBase implements IUserSettingsService {
	private userSettingsFilePath: string = null;
	protected userSettingsData: any = null;

	constructor(userSettingsFilePath: string,
		protected $fs: IFileSystem) {
		this.userSettingsFilePath = userSettingsFilePath;
	}

	public getSettingValue<T>(settingName: string): IFuture<T> {
		return(() => {
			this.loadUserSettingsFile().wait();
			return this.userSettingsData ? this.userSettingsData[settingName] : null;
		}).future<T>()();
	}

	public saveSetting<T>(key: string, value: T): IFuture<void> {
		let settingObject: any = {};
		settingObject[key] = value;

		return this.saveSettings(settingObject);
	}

	public removeSetting(key: string): IFuture<void> {
		return (() => {
			this.loadUserSettingsFile().wait();

			delete this.userSettingsData[key];
			this.saveSettings().wait();
		}).future<void>()();
	}

	public saveSettings(data?: any): IFuture<void> {
		return(() => {
			this.loadUserSettingsFile().wait();
			this.userSettingsData = this.userSettingsData || {};

			_(data)
				.keys()
				.each(propertyName => {
					this.userSettingsData[propertyName] = data[propertyName];
				});

			this.$fs.writeJson(this.userSettingsFilePath, this.userSettingsData);
		}).future<void>()();
	}

	// TODO: Remove IFuture, reason: writeFile - blocked as other implementation of the interface has async operation.
	public loadUserSettingsFile(): IFuture<void> {
		return (() => {
			if(!this.userSettingsData) {
				if(!this.$fs.exists(this.userSettingsFilePath)) {
					this.$fs.writeFile(this.userSettingsFilePath, null);
				}

				this.userSettingsData = this.$fs.readJson(this.userSettingsFilePath);
			}
		}).future<void>()();
	}
}

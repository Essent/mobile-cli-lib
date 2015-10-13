///<reference path="./../../.d.ts"/>
"use strict";

import { EventEmitter } from "events";
import fiberBootstrap = require("../../fiber-bootstrap");

class DeviceEmitter extends EventEmitter {
	private static DEVICE_DISCOVERY_TIMEOUT = 500;

	// TODO: add iOSDeviceDiscovery as a dependency too
	constructor(private $androidDeviceDiscovery:Mobile.IAndroidDeviceDiscovery,
		private $devicesService: Mobile.IDevicesService) {
		super();
	}

	public initialize(): IFuture<void> {
		return (() => {
			this.$androidDeviceDiscovery.ensureAdbServerStarted().wait();
			this.$androidDeviceDiscovery.on("deviceFound", (data: Mobile.IDevice) => {
				this.emit("deviceFound", data.deviceInfo);
			});

			this.$androidDeviceDiscovery.on("deviceLost", (data: Mobile.IDevice) => {
				this.emit("deviceLost", data.deviceInfo);
			});

			setInterval(() =>
				fiberBootstrap.run(() => {
					this.$androidDeviceDiscovery.startLookingForDevices().wait();
				}),
			DeviceEmitter.DEVICE_DISCOVERY_TIMEOUT).unref();

		}).future<void>()();
	}
}
$injector.register("deviceEmitter", DeviceEmitter);

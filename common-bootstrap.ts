///<reference path=".d.ts"/>
"use strict";

require("./bootstrap");
$injector.requirePublicClass("deviceEmitter", "./mobile/mobile-core/deviceEmitter");

import {StaticConfigBase} from "./static-config-base";
import {OptionsBase} from "./options";

// TODO: Add real dependencies
$injector.register("mobilePlatformsCapabilities", {});
$injector.register("config", {});
$injector.register("analyiticsService", {});
$injector.register("staticConfig", StaticConfigBase);
$injector.register("options", $injector.resolve(OptionsBase, {options: {}, defaultProfileDir: ""}));
$injector.requirePublicClass("deviceLogProvider", "./mobile/mobile-core/device-log-provider");

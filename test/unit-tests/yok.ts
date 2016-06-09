///<reference path="../.d.ts"/>
"use strict";
import {assert} from "chai";
import {Yok} from "../../yok";
import * as path from "path";
import * as fs from "fs";
import * as shelljs from "shelljs";
import * as classesWithInitMethod from "./mocks/mockClassesWithInitializeMethod";

class MyClass {
	constructor(private x:string, public y:any) {
	}

	public checkX():void {
		assert.strictEqual(this.x, "foo");
	}
}

describe("yok", () => {
	it("resolves pre-constructed singleton", () => {
		let injector = new Yok();
		let obj = {};
		injector.register("foo", obj);

		let resolved = injector.resolve("foo");

		assert.strictEqual(obj, resolved);
	});

	it("resolves given constructor", () => {
		let injector = new Yok();
		let obj:any;
		injector.register("foo", () => {
			obj = {foo:"foo"};
			return obj;
		});

		let resolved = injector.resolve("foo");

		assert.strictEqual(resolved, obj);
	});

	it("resolves constructed singleton", () => {
		let injector = new Yok();
		injector.register("foo", {foo:"foo"});

		let r1 = injector.resolve("foo");
		let r2 = injector.resolve("foo");

		assert.strictEqual(r1, r2);
	});

	it("injects directly into passed constructor", () => {
		let injector = new Yok();
		let obj = {};
		injector.register("foo", obj);

		function Test(foo:any) {
			this.foo = foo;
		}

		let result = injector.resolve(Test);

		assert.strictEqual(obj, result.foo);
	});

	it("inject dependency into registered constructor", () => {
		let injector = new Yok();
		let obj = {};
		injector.register("foo", obj);

		function Test(foo:any) {
			this.foo = foo;
		}

		injector.register("test", Test);

		let result = injector.resolve("test");

		assert.strictEqual(obj, result.foo);
	});

	it("inject dependency with $ prefix", () => {
		let injector = new Yok();
		let obj = {};
		injector.register("foo", obj);

		function Test($foo:any) {
			this.foo = $foo;
		}

		let result = injector.resolve(Test);

		assert.strictEqual(obj, result.foo);
	});

	it("inject into TS constructor", () => {
		let injector = new Yok();

		injector.register("x", "foo");
		injector.register("y", 123);

		let result = <MyClass> injector.resolve(MyClass);

		assert.strictEqual(result.y, 123);
		result.checkX();
	});

	it("resolves a parameterless constructor", () => {
		let injector = new Yok();

		function Test() {
			this.foo = "foo";
		}

		let result = injector.resolve(Test);

		assert.equal(result.foo, "foo");
	});

	it("returns null when it can't resolve a command", () => {
		let injector = new Yok();
		let command = injector.resolveCommand("command");
		assert.isNull(command);
	});

	it("throws when it can't resolve a registered command", () => {
		let injector = new Yok();

		function Command(whatever:any) { /* intentionally left blank */ }

		injector.registerCommand("command", Command);

		assert.throws(() => injector.resolveCommand("command"));
	});

	it("disposes", () => {
		let injector = new Yok();

		function Thing() { /* intentionally left blank */ }

		Thing.prototype.dispose = function() {
			this.disposed = true;
		};

		injector.register("thing", Thing);
		let thing = injector.resolve("thing");
		injector.dispose();

		assert.isTrue(thing.disposed);
	});

	it("throws error when module is required more than once", () => {
		let injector = new Yok();
		injector.require("foo", "test");
		assert.throws(() => injector.require("foo", "test2"));
	});

	it("adds module to public api when requirePublic is used", () => {
		let injector = new Yok();
		injector.requirePublic("foo", "test");
		assert.isTrue(_.includes(Object.getOwnPropertyNames(injector.publicApi), "foo"));
	});

	describe("buildHierarchicalCommand", () => {
		let injector: IInjector;
		beforeEach(() => {
			injector = new Yok();
		});

		describe("returns undefined", () => {
			it("when there's no valid hierarchical command", () => {
				injector.requireCommand("sample|command", "sampleFileName");
				assert.isUndefined(injector.buildHierarchicalCommand("command", ["subCommand"]), "When there's no matching subcommand, buildHierarchicalCommand should return undefined.");
			});

			it("when there's no hierarchical commands required", () => {
				assert.isUndefined(injector.buildHierarchicalCommand("command", ["subCommand"]), "When there's no hierarchical commands required, buildHierarchicalCommand should return undefined.");
			});

			it("when only one argument is passed", () => {
				assert.isUndefined(injector.buildHierarchicalCommand("command", []), "When when only one argument is passed, buildHierarchicalCommand should return undefined.");
			});

			it("when there's matching command, but it is not hierarchical command", () => {
				injector.requireCommand("command", "sampleFileName");
				assert.isUndefined(injector.buildHierarchicalCommand("command", []), "When there's matching command, but it is not hierarchical command, buildHierarchicalCommand should return undefined.");
			});
		});

		describe("returns correct command and arguments when command name has one pipe (|)", () => {
			it("when only command is passed, no arguments are returned", () => {
				let commandName = "sample|command";
				injector.requireCommand(commandName, "sampleFileName");
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command"]);
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
			});

			it("when command is passed, correct arguments are returned", () => {
				let commandName = "sample|command";
				injector.requireCommand(commandName, "sampleFileName");
				let sampleArguments = ["sample", "arguments", "passed", "to", "command"];
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command"].concat(sampleArguments));
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except first one should be returned.");
			});

			it("when command is passed, correct arguments are returned when command argument has uppercase letters", () => {
				let commandName = "sample|command";
				injector.requireCommand(commandName, "sampleFileName");
				let sampleArguments = ["sample", "arguments", "passed", "to", "command"];
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["CoMmanD"].concat(sampleArguments));
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except first one should be returned.");
			});

			it("when only default command is passed, no arguments are returned", () => {
				let commandName = "sample|*command";
				injector.requireCommand(commandName, "sampleFileName");
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command"]);
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
			});

			it("when default command is passed, correct arguments are returned", () => {
				let commandName = "sample|*command";
				injector.requireCommand(commandName, "sampleFileName");
				let sampleArguments = ["sample", "arguments", "passed", "to", "command"];
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command"].concat(sampleArguments));
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except first one should be returned.");
			});
		});

		describe("returns correct command and arguments when command name has more than one pipe (|)", () => {
			it("when only command is passed, no arguments are returned", () => {
				let commandName = "sample|command|with|more|pipes";
				injector.requireCommand(commandName, "sampleFileName");
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "with", "more", "pipes"]);
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
			});

			it("when command is passed, correct arguments are returned", () => {
				let commandName = "sample|command|pipes";
				injector.requireCommand(commandName, "sampleFileName");
				let sampleArguments = ["sample", "arguments", "passed", "to", "command"];
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "pipes"].concat(sampleArguments));
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except the ones used for commandName should be returned.");
			});

			it("when only default command is passed, no arguments are returned", () => {
				let commandName = "sample|*command|pipes";
				injector.requireCommand(commandName, "sampleFileName");
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "pipes"]);
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
			});

			it("when default command is passed, correct arguments are returned", () => {
				let commandName = "sample|*command|pipes";
				injector.requireCommand(commandName, "sampleFileName");
				let sampleArguments = ["sample", "arguments", "passed", "to", "command"];
				let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "pipes"].concat(sampleArguments));
				assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
				assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except the ones used for commandName should be returned.");
			});

			describe("returns most applicable hierarchical command", () => {
				let sampleArguments = ["sample", "arguments", "passed", "to", "command"];
				beforeEach(() => {
					injector.requireCommand("sample|command", "sampleFileName");
					injector.requireCommand("sample|command|with", "sampleFileName");
					injector.requireCommand("sample|command|with|more", "sampleFileName");
					injector.requireCommand("sample|command|with|more|pipes", "sampleFileName");
				});
				it("when subcommand of subcommand is called", () => {
					let commandName = "sample|command|with|more|pipes";
					let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "with", "more", "pipes"]);
					assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
					assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
				});

				it("and correct arguments, when subcommand of subcommand is called", () => {
					let commandName = "sample|command|with|more|pipes";
					let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "with", "more", "pipes"].concat(sampleArguments));
					assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
					assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except the ones used for commandName should be returned.");
				});

				it("when top subcommand is called and it has its own subcommand", () => {
					let commandName = "sample|command";
					let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command"]);
					assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
					assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
				});

				it("and correct arguments, when top subcommand is called and it has its own subcommand", () => {
					let commandName = "sample|command";
					let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command"].concat(sampleArguments));
					assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
					assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except the ones used for commandName should be returned.");
				});

				it("when subcommand of subcommand is called and it has its own subcommand", () => {
					let commandName = "sample|command|with";
					let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "with"]);
					assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
					assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, [], "There shouldn't be any arguments left.");
				});

				it("and correct arguments, when subcommand of subcommand is called and it has its own subcommand", () => {
					let commandName = "sample|command|with";
					let buildHierarchicalCommandResult = injector.buildHierarchicalCommand("sample", ["command", "with"].concat(sampleArguments));
					assert.deepEqual(buildHierarchicalCommandResult.commandName, commandName, `The expected command name is ${commandName}`);
					assert.deepEqual(buildHierarchicalCommandResult.remainingArguments, sampleArguments, "All arguments except the ones used for commandName should be returned.");
				});
			});
		});
	});

	function deleteDirectory(directory: string): boolean {
		shelljs.rm("-rf", directory);
		let err = shelljs.error();
		return err === null;
	}

	it("adds whole class to public api when requirePublicClass is used", () => {
		let injector = new Yok();
		let dataObject =  {
			a: "testA",
			b: {
				c: "testC"
			}
		};

		let filepath = path.join(__dirname, "..", "..", "temp.js");
		fs.writeFileSync(filepath, "");

		// Call to requirePublicClass will add the class to publicApi object.
		injector.requirePublicClass("foo", "./temp");
		injector.register("foo", dataObject);
		// Get the real instance here, so we can delete the file before asserts.
		// This way we'll keep the directory clean, even if assert fails.
		let resultFooObject = injector.publicApi.foo;
		if (!deleteDirectory(filepath)) {
			console.log(`Unable to delete file used for tests: ${filepath}.`);
		}
		assert.isTrue(_.includes(Object.getOwnPropertyNames(injector.publicApi), "foo"));
		assert.deepEqual(resultFooObject, dataObject);
	});

	it("automatically calls initialize method of a class when initialize returns IFuture", () => {
		let injector = new Yok();
		// Call to requirePublicClass will add the class to publicApi object.
		injector.requirePublicClass("classWithInitMethod", "./test/unit-tests/mocks/mockClassesWithInitializeMethod");
		injector.register("classWithInitMethod", classesWithInitMethod.ClassWithFuturizedInitializeMethod);
		let resultClassWithInitMethod = injector.publicApi.classWithInitMethod;
		assert.isTrue(_.includes(Object.getOwnPropertyNames(injector.publicApi), "classWithInitMethod"));
		assert.isTrue(resultClassWithInitMethod.isInitializedCalled, "isInitalizedCalled is not set to true, so method had not been called");
	});

	it("automatically calls initialize method of a class when initialize does NOT return IFuture", () => {
		let injector = new Yok();
		// Call to requirePublicClass will add the class to publicApi object.
		injector.requirePublicClass("classWithInitMethod", "./test/unit-tests/mocks/mockClassesWithInitializeMethod");
		injector.register("classWithInitMethod", classesWithInitMethod.ClassWithInitializeMethod);
		let resultClassWithInitMethod = injector.publicApi.classWithInitMethod;
		assert.isTrue(_.includes(Object.getOwnPropertyNames(injector.publicApi), "classWithInitMethod"));
		assert.isTrue(resultClassWithInitMethod.isInitializedCalled, "isInitalizedCalled is not set to true, so method had not been called");
	});
});

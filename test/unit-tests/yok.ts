///<reference path="../.d.ts"/>
"use strict";
import {assert} from "chai";
import {Yok} from "../../yok";
import * as path from "path";
import * as fs from "fs";
import rimraf = require("rimraf");
import Future = require("fibers/future");
let isInitalizedCalled = false;
// class Person {
// 	public initialize() {
// 		console.log("initialized calledddd");
// 		isInitalizedCalled = true;
// 		return Future.fromResult();
// 	}
// }

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
		assert.isTrue(_.contains(Object.getOwnPropertyNames(injector.publicApi), "foo"));
	});
	
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
		rimraf(filepath, (err: Error) => {
			if(err) {
				console.log(`Unable to delete file used for tests: ${filepath}.`);
			}
		});
		assert.isTrue(_.contains(Object.getOwnPropertyNames(injector.publicApi), "foo"));
		assert.deepEqual(resultFooObject, dataObject);
	});

// This test is currently not working, 
// 	it("automatically calls initialize method of a class", () => {
// 		let injector = new Yok();
// 		let future = new Future<void>();
// 		// let isInitalizedCalled = false;
// 
// 		let filepath = path.join(__dirname, "..", "..", "temp.js");
// 		fs.writeFileSync(filepath, "");
// 
// 		// Call to requirePublicClass will add the class to publicApi object.
// 		injector.requirePublicClass("foo", "./temp");
// 		console.log("register it");
// 		injector.register("foo", Person);
// 		console.log("now lets get it");
// 		// Get the real instance here, so we can delete the file before asserts. 
// 		// This way we'll keep the directory clean, even if assert fails.
// 		let resultFooObject = injector.publicApi.foo;
// 		console.log("before rimraf")
// 		rimraf(filepath, (err: Error) => {
// 			if(err) {
// 				console.log(`Unable to delete ${filepath}.`);
// 			}
// 		});
// 		console.log("before first assert");
// 		assert.isTrue(_.contains(Object.getOwnPropertyNames(injector.publicApi), "foo"));
// 		// Use setTimeout in order to allow the fiber in yok's requirePublicClass to be executed.
// 		// future.wait();
// 		console.log("after set timeout"); 
// 		assert.isFalse(isInitalizedCalled, "isInitalizedCalled is not set to true, so method had not been called");
// 	});
});

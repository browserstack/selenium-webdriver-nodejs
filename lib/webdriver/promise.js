// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * @license Portions of this code are from the Dojo toolkit, received under the
 * BSD License:
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *   * Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *   * Redistributions in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *   * Neither the name of the Dojo Foundation nor the names of its contributors
 *     may be used to endorse or promote products derived from this software
 *     without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @fileoverview
 * The promise module is centered around the
 * {@linkplain webdriver.promise.ControlFlow ControlFlow}, a class that
 * coordinates the execution of asynchronous tasks. The ControlFlow allows users
 * to focus on the imperative commands for their script without worrying about
 * chaining together every single asynchronous action, which can be tedious and
 * verbose. APIs may be layered on top of the control flow to read as if they
 * were synchronous. For instance, the core
 * {@linkplain webdriver.WebDriver WebDriver} API is built on top of the
 * control flow, allowing users to write
 *
 *     driver.get('http://www.google.com/ncr');
 *     driver.findElement({name: 'q'}).sendKeys('webdriver');
 *     driver.findElement({name: 'btnGn'}).click();
 *
 * instead of
 *
 *     driver.get('http://www.google.com/ncr')
 *     .then(function() {
 *       return driver.findElement({name: 'q'});
 *     })
 *     .then(function(q) {
 *       return q.sendKeys('webdriver');
 *     })
 *     .then(function() {
 *       return driver.findElement({name: 'btnG'});
 *     })
 *     .then(function(btnG) {
 *       return btnG.click();
 *     });
 *
 * ## Tasks and Task Queues
 *
 * The control flow is based on the concept of tasks and task queues. Tasks are
 * functions that define the basic unit of work for the control flow to execute.
 * Each task is scheduled via
 * {@link webdriver.promise.ControlFlow#execute() ControlFlow#execute()}, which
 * will return a {@link webdriver.promise.Promise Promise} that will be resolved
 * with the task's result.
 *
 * A task queue contains all of the tasks scheduled within a single turn of the
 * [JavaScript event loop][JSEL]. The control flow will create a new task queue
 * the first time a task is scheduled within an event loop.
 *
 *     var flow = promise.controlFlow();
 *     flow.execute(foo);       // Creates a new task queue and inserts foo.
 *     flow.execute(bar);       // Inserts bar into the same queue as foo.
 *     setTimeout(function() {
 *       flow.execute(baz);     // Creates a new task queue and inserts baz.
 *     }, 0);
 *
 * Whenever the control flow creates a new task queue, it will automatically
 * begin executing tasks in the next available turn of the event loop. This
 * execution is scheduled using a "micro-task" timer, such as a (native)
 * `Promise.then()` callback.
 *
 *     setTimeout(() => console.log('a'));
 *     Promise.resolve().then(() => console.log('b'));  // A native promise.
 *     flow.execute(() => console.log('c'));
 *     Promise.resolve().then(() => console.log('d'));
 *     setTimeout(() => console.log('fin'));
 *     // b
 *     // c
 *     // d
 *     // a
 *     // fin
 *
 * In the example above, b/c/d is logged before a/fin because native promises
 * and this module use "micro-task" timers, which have a higher priority than
 * "macro-tasks" like `setTimeout`.
 *
 * ## Task Execution
 *
 * Upon creating a task queue, and whenever an exisiting queue completes a task,
 * the control flow will schedule a micro-task timer to process any scheduled
 * tasks. This ensures no task is ever started within the same turn of the
 * JavaScript event loop in which it was scheduled, nor is a task ever started
 * within the same turn that another finishes.
 *
 * When the execution timer fires, a single task will be dequeued and executed.
 * There are several important events that may occur while executing a task
 * function:
 *
 * 1. A new task queue is created by a call to
 *    {@link webdriver.promise.ControlFlow#execute ControlFlow#execute()}. Any
 *    tasks scheduled within this task queue are considered subtasks of the
 *    current task.
 * 2. The task function throws an error. Any scheduled tasks are immediately
 *    discarded and the task's promised result (previously returned by
 *    {@link webdriver.promise.ControlFlow#execute ControlFlow#execute()}) is
 *    immediately rejected with the thrown error.
 * 3. The task function returns sucessfully.
 *
 * If a task function created a new task queue, the control flow will wait for
 * that queue to complete before processing the task result. If the queue
 * completes without error, the flow will settle the task's promise with the
 * value originaly returned by the task function. On the other hand, if the task
 * queue termintes with an error, the task's promise will be rejected with that
 * error.
 *
 *     flow.execute(function() {
 *       flow.execute(() => console.log('a'));
 *       flow.execute(() => console.log('b'));
 *     });
 *     flow.execute(() => console.log('c'));
 *     // a
 *     // b
 *     // c
 *
 * ## Promise Integration
 *
 * In addition to the {@link webdriver.promise.ControlFlow ControlFlow} class,
 * the promise module also exports a [Promise/A+]
 * {@linkplain webdriver.promise.Promise implementation} that is deeply
 * integrated with the ControlFlow. First and foremost, each promise
 * {@linkplain webdriver.promise.Promise#then() callback} is scheduled with the
 * control flow as a task. As a result, each callback is invoked in its own turn
 * of the JavaScript event loop with its own task queue. If any tasks are
 * scheduled within a callback, the callback's promised result will not be
 * settled until the task queue has completed.
 *
 *     promise.fulfilled().then(function() {
 *       flow.execute(function() {
 *         console.log('b');
 *       });
 *     }).then(() => console.log('a'));
 *     // b
 *     // a
 *
 * ### Scheduling Promise Callbacks <a id="scheduling_callbacks"></a>
 *
 * How callbacks are scheduled in the control flow depends on when they are
 * attached to the promise. Callbacks attached to a _previously_ resolved
 * promise are immediately enqueued as subtasks of the currently running task.
 *
 *     var p = promise.fulfilled();
 *     flow.execute(function() {
 *       flow.execute(() => console.log('A'));
 *       p.then(      () => console.log('B'));
 *       flow.execute(() => console.log('C'));
 *       p.then(      () => console.log('D'));
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // B
 *     // C
 *     // D
 *     // fin
 *
 * When a promise is resolved while a task function is on the call stack, any
 * callbacks also registered in that stack frame are scheduled as if the promise
 * were already resolved:
 *
 *     var d = promise.defer();
 *     flow.execute(function() {
 *       flow.execute(  () => console.log('A'));
 *       d.promise.then(() => console.log('B'));
 *       flow.execute(  () => console.log('C'));
 *       d.promise.then(() => console.log('D'));
 *
 *       d.fulfill();
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // B
 *     // C
 *     // D
 *     // fin
 *
 * If a promise is resolved while a task function is on the call stack, any
 * previously registered callbacks (i.e. attached while the task was _not_ on
 * the call stack), act as _interrupts_ and are inserted at the front of the
 * task queue. If multiple promises are fulfilled, their interrupts are enqueued
 * in the order the promises are resolved.
 *
 *     var d1 = promise.defer();
 *     d1.promise.then(() => console.log('A'));
 *
 *     var d2 = promise.defer();
 *     d2.promise.then(() => console.log('B'));
 *
 *     flow.execute(function() {
 *       flow.execute(() => console.log('C'));
 *       flow.execute(() => console.log('D'));
 *       d1.fulfill();
 *       d2.fulfill();
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // B
 *     // C
 *     // D
 *     // fin
 *
 * Within a task function (or callback), each step of a promise chain acts as
 * an interrupt on the task queue:
 *
 *     var d = promise.defer();
 *     flow.execute(function() {
 *       d.promise.
 *           then(() => console.log('A')).
 *           then(() => console.log('B')).
 *           then(() => console.log('C')).
 *           then(() => console.log('D'));
 *
 *       flow.execute(() => console.log('E'));
 *       d.fulfill();
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // B
 *     // C
 *     // D
 *     // E
 *     // fin
 *
 * If there are multiple promise chains derived from a single promise, they are
 * processed in the order created:
 *
 *     var d = promise.defer();
 *     flow.execute(function() {
 *       var chain = d.promise.then(() => console.log('A'));
 *
 *       chain.then(() => console.log('B')).
 *           then(() => console.log('C'));
 *
 *       chain.then(() => console.log('D')).
 *           then(() => console.log('E'));
 *
 *       flow.execute(() => console.log('F'));
 *
 *       d.fulfill();
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // B
 *     // C
 *     // D
 *     // E
 *     // F
 *     // fin
 *
 * Even though a subtask's promised result will never resolve while the task
 * function is on the stack, it will be treated as a promise resolved within the
 * task. In all other scenarios, a task's promise behaves just like a normal
 * promise. In the sample below, `C/D` is loggged before `B` because the
 * resolution of `subtask1` interrupts the flow of the enclosing task. Within
 * the final subtask, `E/F` is logged in order because `subtask1` is a resolved
 * promise when that task runs.
 *
 *     flow.execute(function() {
 *       var subtask1 = flow.execute(() => console.log('A'));
 *       var subtask2 = flow.execute(() => console.log('B'));
 *
 *       subtask1.then(() => console.log('C'));
 *       subtask1.then(() => console.log('D'));
 *
 *       flow.execute(function() {
 *         flow.execute(() => console.log('E'));
 *         subtask1.then(() => console.log('F'));
 *       });
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // C
 *     // D
 *     // B
 *     // E
 *     // F
 *     // fin
 *
 * __Note__: while the ControlFlow will wait for
 * {@linkplain webdriver.promise.ControlFlow#execute tasks} and
 * {@linkplain webdriver.promise.Promise#then callbacks} to complete, it
 * _will not_ wait for unresolved promises created within a task:
 *
 *     flow.execute(function() {
 *       var p = new promise.Promise(function(fulfill) {
 *         setTimeout(fulfill, 100);
 *       });
 *
 *       p.then(() => console.log('promise resolved!'));
 *
 *     }).then(function() {
 *       console.log('task complete!');
 *     });
 *     // task complete!
 *     // promise resolved!
 *
 * Finally, consider the following:
 *
 *     var d = promise.defer();
 *     d.promise.then(() => console.log('A'));
 *     d.promise.then(() => console.log('B'));
 *
 *     flow.execute(function() {
 *       flow.execute(  () => console.log('C'));
 *       d.promise.then(() => console.log('D'));
 *
 *       flow.execute(  () => console.log('E'));
 *       d.promise.then(() => console.log('F'));
 *
 *       d.fulfill();
 *
 *       flow.execute(  () => console.log('G'));
 *       d.promise.then(() => console.log('H'));
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // A
 *     // B
 *     // C
 *     // D
 *     // E
 *     // F
 *     // G
 *     // H
 *     // fin
 *
 * In this example, callbacks are registered on `d.promise` both before and
 * during the invocation of the task function. When `d.fulfill()` is called,
 * the callbacks registered before the task (`A` & `B`) are registered as
 * interrupts. The remaining callbacks were all attached within the task and
 * are scheduled in the flow as standard tasks.
 *
 * ## Generator Support
 *
 * [Generators][GF] may be scheduled as tasks within a control flow or attached
 * as callbacks to a promise. Each time the generator yields a promise, the
 * control flow will wait for that promise to settle before executing the next
 * iteration of the generator. The yielded promise's fulfilled value will be
 * passed back into the generator:
 *
 *     flow.execute(function* () {
 *       var d = promise.defer();
 *
 *       setTimeout(() => console.log('...waiting...'), 25);
 *       setTimeout(() => d.fulfill(123), 50);
 *
 *       console.log('start: ' + Date.now());
 *
 *       var value = yield d.promise;
 *       console.log('mid: %d; value = %d', Date.now(), value);
 *
 *       yield promise.delayed(10);
 *       console.log('end: ' + Date.now());
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // start: 0
 *     // ...waiting...
 *     // mid: 50; value = 123
 *     // end: 60
 *     // fin
 *
 * Yielding the result of a promise chain will wait for the entire chain to
 * complete:
 *
 *     promise.fulfilled().then(function* () {
 *       console.log('start: ' + Date.now());
 *
 *       var value = yield flow.
 *           execute(() => console.log('A')).
 *           then(   () => console.log('B')).
 *           then(   () => 123);
 *
 *       console.log('mid: %s; value = %d', Date.now(), value);
 *
 *       yield flow.execute(() => console.log('C'));
 *     }).then(function() {
 *       console.log('fin');
 *     });
 *     // start: 0
 *     // A
 *     // B
 *     // mid: 2; value = 123
 *     // C
 *     // fin
 *
 * Yielding a _rejected_ promise will cause the rejected value to be thrown
 * within the generator function:
 *
 *     flow.execute(function* () {
 *       console.log('start: ' + Date.now());
 *       try {
 *         yield promise.delayed(10).then(function() {
 *           throw Error('boom');
 *         });
 *       } catch (ex) {
 *         console.log('caught time: ' + Date.now());
 *         console.log(ex.message);
 *       }
 *     });
 *     // start: 0
 *     // caught time: 10
 *     // boom
 *
 * # Error Handling
 *
 * ES6 promises do not require users to handle a promise rejections. This can
 * result in subtle bugs as the rejections are silently "swallowed" by the
 * Promise class.
 *
 *     Promise.reject(Error('boom'));
 *     // ... *crickets* ...
 *
 * Selenium's {@link webdriver.promise promise} module, on the other hand,
 * requires that every rejection be explicitly handled. When a
 * {@linkplain webdriver.promise.Promise Promise} is rejected and no callbacks
 * are defined on that promise, it is considered an _unhandled rejection_ and
 * reproted to the active task queue. If the rejection remains unhandled after
 * a single turn of the [event loop][JSEL] (scheduled with a micro-task), it
 * will propagate up the stack.
 *
 * ## Error Propagation
 *
 * If an unhandled rejection occurs within a task function, that task's promised
 * result is rejected and all remaining subtasks are discarded:
 *
 *     flow.execute(function() {
 *       // No callbacks registered on promise -> unhandled rejection
 *       promise.rejected(Error('boom'));
 *       flow.execute(function() { console.log('this will never run'); });
 *     }).thenCatch(function(e) {
 *       console.log(e.message);
 *     });
 *     // boom
 *
 * The promised results for discarded tasks are silently rejected with a
 * cancellation error and existing callback chains will never fire.
 *
 *     flow.execute(function() {
 *       promise.rejected(Error('boom'));
 *       flow.execute(function() { console.log('a'); }).
 *           then(function() { console.log('b'); });
 *     }).thenCatch(function(e) {
 *       console.log(e.message);
 *     });
 *     // boom
 *
 * An unhandled rejection takes precedence over a task function's returned
 * result, even if that value is another promise:
 *
 *     flow.execute(function() {
 *       promise.rejected(Error('boom'));
 *       return flow.execute(someOtherTask);
 *     }).thenCatch(function(e) {
 *       console.log(e.message);
 *     });
 *     // boom
 *
 * If there are multiple unhandled rejections within a task, they are packaged
 * in a {@link webdriver.promise.MultipleUnhandledRejectionError
 * MultipleUnhandledRejectionError}, which has an `errors` property that is a
 * `Set` of the recorded unhandled rejections:
 *
 *     flow.execute(function() {
 *       promise.rejected(Error('boom1'));
 *       promise.rejected(Error('boom2'));
 *     }).thenCatch(function(ex) {
 *       console.log(ex instanceof promise.MultipleUnhandledRejectionError);
 *       for (var e of ex.errors) {
 *         console.log(e.message);
 *       }
 *     });
 *     // boom1
 *     // boom2
 *
 * When a subtask is discarded due to an unreported rejection in its parent
 * frame, the existing callbacks on that task will never settle and the
 * callbacks will not be invoked. If a new callback is attached ot the subtask
 * _after_ it has been discarded, it is handled the same as adding a callback
 * to a cancelled promise: the error-callback path is invoked. This behavior is
 * intended to handle cases where the user saves a reference to a task promise,
 * as illustrated below.
 *
 *     var subTask;
 *     flow.execute(function() {
 *       promise.rejected(Error('boom'));
 *       subTask = flow.execute(function() {});
 *     }).thenCatch(function(e) {
 *       console.log(e.message);
 *     }).then(function() {
 *       return subTask.then(
 *           () => console.log('subtask success!'),
 *           (e) => console.log('subtask failed:\n' + e));
 *     });
 *     // boom
 *     // subtask failed:
 *     // DiscardedTaskError: Task was discarded due to a previous failure: boom
 *
 * When a subtask fails, its promised result is treated the same as any other
 * promise: it must be handled within one turn of the rejection or the unhandled
 * rejection is propagated to the parent task. This means users can catch errors
 * from complex flows from the top level task:
 *
 *     flow.execute(function() {
 *       flow.execute(function() {
 *         flow.execute(function() {
 *           throw Error('fail!');
 *         });
 *       });
 *     }).thenCatch(function(e) {
 *       console.log(e.message);
 *     });
 *     // fail!
 *
 * ## Unhandled Rejection Events
 *
 * When an unhandled rejection propagates to the root of the control flow, the
 * flow will emit an __uncaughtException__ event. If no listeners are registered
 * on the flow, the error will be rethrown to the global error handler: an
 * __uncaughtException__ event from the
 * [`process`](https://nodejs.org/api/process.html) object in node, or
 * `window.onerror` when running in a browser.
 *
 * Bottom line: you __*must*__ handle rejected promises.
 *
 * # Promise/A+ Compatibility
 *
 * This `promise` module is compliant with the [Promise/A+][] specification
 * except for sections `2.2.6.1` and `2.2.6.2`:
 *
 * >
 * > - `then` may be called multiple times on the same promise.
 * >    - If/when `promise` is fulfilled, all respective `onFulfilled` callbacks
 * >      must execute in the order of their originating calls to `then`.
 * >    - If/when `promise` is rejected, all respective `onRejected` callbacks
 * >      must execute in the order of their originating calls to `then`.
 * >
 *
 * Specifically, the conformance tests contains the following scenario (for
 * brevity, only the fulfillment version is shown):
 *
 *     var p1 = Promise.resolve();
 *     p1.then(function() {
 *       console.log('A');
 *       p1.then(() => console.log('B'));
 *     });
 *     p1.then(() => console.log('C'));
 *     // A
 *     // C
 *     // B
 *
 * Since the [ControlFlow](#scheduling_callbacks) executes promise callbacks as
 * tasks, with this module, the result would be
 *
 *     var p2 = promise.fulfilled();
 *     p2.then(function() {
 *       console.log('A');
 *       p2.then(() => console.log('B');
 *     });
 *     p2.then(() => console.log('C'));
 *     // A
 *     // B
 *     // C
 *
 * [JSEL]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop
 * [GF]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
 * [Promise/A+]: https://promisesaplus.com/
 */

goog.module('webdriver.promise');
goog.module.declareLegacyNamespace();

var Arrays = goog.require('goog.array');
var asserts = goog.require('goog.asserts');
var asyncRun = goog.require('goog.async.run');
var throwException = goog.require('goog.async.throwException');
var DebugError = goog.require('goog.debug.Error');
var log = goog.require('goog.log');
var Objects = goog.require('goog.object');
var EventEmitter = goog.require('webdriver.EventEmitter');
var stacktrace = goog.require('webdriver.stacktrace');



/**
 * @define {boolean} Whether to append traces of {@code then} to rejection
 *     errors.
 */
goog.define('webdriver.promise.LONG_STACK_TRACES', false);

/** @const */
var promise = exports;


/** @const */
var LOG = log.getLogger('webdriver.promise');


/**
 * @param {number} level What level of verbosity to log with.
 * @param {(string|function(this: T): string)} loggable The message to log.
 * @param {T=} opt_self The object in whose context to run the loggable
 *     function.
 * @template T
 */
function vlog(level, loggable, opt_self) {
  var logLevel = log.Level.FINE;
  if (level > 1) {
    logLevel = log.Level.FINEST;
  } else if (level > 0) {
    logLevel = log.Level.FINER;
  }

  if (typeof loggable === 'function') {
    loggable = loggable.bind(opt_self);
  }

  log.log(LOG, logLevel, loggable);
}


/**
 * Generates an error to capture the current stack trace.
 * @param {string} name Error name for this stack trace.
 * @param {string} msg Message to record.
 * @param {!Function} topFn The function that should appear at the top of the
 *     stack; only applicable in V8.
 * @return {!Error} The generated error.
 */
promise.captureStackTrace = function(name, msg, topFn) {
  var e = Error(msg);
  e.name = name;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(e, topFn);
  } else {
    var stack = stacktrace.getStack(e);
    e.stack = e.toString();
    if (stack) {
      e.stack += '\n' + stack;
    }
  }
  return e;
};


/**
 * Error used when the computation of a promise is cancelled.
 *
 * @unrestricted
 */
promise.CancellationError = goog.defineClass(DebugError, {
  /**
   * @param {string=} opt_msg The cancellation message.
   */
  constructor: function(opt_msg) {
    promise.CancellationError.base(this, 'constructor', opt_msg);

    /** @override */
    this.name = 'CancellationError';

    /** @private {boolean} */
    this.silent_ = false;
  },

  statics: {
    /**
     * Wraps the given error in a CancellationError.
     *
     * @param {*} error The error to wrap.
     * @param {string=} opt_msg The prefix message to use.
     * @return {!promise.CancellationError} A cancellation error.
     */
    wrap: function(error, opt_msg) {
      var message;
      if (error instanceof promise.CancellationError) {
        return new promise.CancellationError(
            opt_msg ? (opt_msg + ': ' + error.message) : error.message);
      } else if (opt_msg) {
        message = opt_msg;
        if (error) {
          message += ': ' + error;
        }
        return new promise.CancellationError(message);
      }
      if (error) {
        message = error + '';
      }
      return new promise.CancellationError(message);
    }
  }
});


/**
 * Error used to cancel tasks when a control flow is reset.
 * @unrestricted
 * @final
 */
var FlowResetError = goog.defineClass(promise.CancellationError, {
  constructor: function() {
    FlowResetError.base(this, 'constructor', 'ControlFlow was reset');

    /** @override */
    this.name = 'FlowResetError';

    this.silent_ = true;
  }
});


/**
 * Error used to cancel tasks that have been discarded due to an uncaught error
 * reported earlier in the control flow.
 * @unrestricted
 * @final
 */
var DiscardedTaskError = goog.defineClass(promise.CancellationError, {
  /** @param {*} error The original error. */
  constructor: function(error) {
    if (error instanceof DiscardedTaskError) {
      return /** @type {!DiscardedTaskError} */(error);
    }

    var msg = '';
    if (error) {
      msg = ': ' + (typeof error.message === 'string' ? error.message : error);
    }

    DiscardedTaskError.base(this, 'constructor',
        'Task was discarded due to a previous failure' + msg);

    /** @override */
    this.name = 'DiscardedTaskError';
    this.silent_ = true;
  }
});


/**
 * Error used when there are multiple unhandled promise rejections detected
 * within a task or callback.
 *
 * @unrestricted
 * @final
 */
promise.MultipleUnhandledRejectionError = goog.defineClass(DebugError, {
  /**
   * @param {!(Set<*>)} errors The errors to report.
   */
  constructor: function(errors) {
    promise.MultipleUnhandledRejectionError.base(
        this, 'constructor', 'Multiple unhandled promise rejections reported');

    /** @override */
    this.name = 'MultipleUnhandledRejectionError';

    /** @type {!Set<*>} */
    this.errors = errors;
  }
});


/**
 * Property used to flag constructor's as implementing the Thenable interface
 * for runtime type checking.
 * @type {string}
 * @const
 */
var IMPLEMENTED_BY_PROP = '$webdriver_Thenable';


/**
 * Thenable is a promise-like object with a {@code then} method which may be
 * used to schedule callbacks on a promised value.
 *
 * @interface
 * @extends {IThenable<T>}
 * @template T
 */
promise.Thenable = goog.defineClass(null, {
  statics: {
    /**
     * Adds a property to a class prototype to allow runtime checks of whether
     * instances of that class implement the Thenable interface. This function
     * will also ensure the prototype's {@code then} function is exported from
     * compiled code.
     * @param {function(new: promise.Thenable, ...?)} ctor The
     *     constructor whose prototype to modify.
     */
    addImplementation: function(ctor) {
      // Based on goog.promise.Thenable.isImplementation.
      ctor.prototype['then'] = ctor.prototype.then;
      try {
        // Old IE7 does not support defineProperty; IE8 only supports it for
        // DOM elements.
        Object.defineProperty(
          ctor.prototype,
          IMPLEMENTED_BY_PROP,
          {'value': true, 'enumerable': false});
      } catch (ex) {
        ctor.prototype[IMPLEMENTED_BY_PROP] = true;
      }
    },

    /**
     * Checks if an object has been tagged for implementing the Thenable
     * interface as defined by
     * {@link webdriver.promise.Thenable.addImplementation}.
     * @param {*} object The object to test.
     * @return {boolean} Whether the object is an implementation of the Thenable
     *     interface.
     */
    isImplementation: function(object) {
      // Based on goog.promise.Thenable.isImplementation.
      if (!object) {
        return false;
      }
      try {
        return !!object[IMPLEMENTED_BY_PROP];
      } catch (e) {
        return false;  // Property access seems to be forbidden.
      }
    }
  },

  /**
   * Cancels the computation of this promise's value, rejecting the promise in
   * the process. This method is a no-op if the promise has already been
   * resolved.
   *
   * @param {(string|promise.CancellationError)=} opt_reason The reason this
   *     promise is being cancelled.
   */
  cancel: function(opt_reason) {},

  /** @return {boolean} Whether this promise's value is still being computed. */
  isPending: function() {},

  /**
   * Registers listeners for when this instance is resolved.
   *
   * @param {?(function(T): (R|IThenable<R>))=} opt_callback The
   *     function to call if this promise is successfully resolved. The function
   *     should expect a single argument: the promise's resolved value.
   * @param {?(function(*): (R|IThenable<R>))=} opt_errback
   *     The function to call if this promise is rejected. The function should
   *     expect a single argument: the rejection reason.
   * @return {!promise.Promise<R>} A new promise which will be
   *     resolved with the result of the invoked callback.
   * @template R
   */
  then: function(opt_callback, opt_errback) {},

  /**
   * Registers a listener for when this promise is rejected. This is synonymous
   * with the {@code catch} clause in a synchronous API:
   *
   *     // Synchronous API:
   *     try {
   *       doSynchronousWork();
   *     } catch (ex) {
   *       console.error(ex);
   *     }
   *
   *     // Asynchronous promise API:
   *     doAsynchronousWork().thenCatch(function(ex) {
   *       console.error(ex);
   *     });
   *
   * @param {function(*): (R|IThenable<R>)} errback The
   *     function to call if this promise is rejected. The function should
   *     expect a single argument: the rejection reason.
   * @return {!promise.Promise<R>} A new promise which will be
   *     resolved with the result of the invoked callback.
   * @template R
   */
  thenCatch: function(errback) {},

  /**
   * Registers a listener to invoke when this promise is resolved, regardless
   * of whether the promise's value was successfully computed. This function
   * is synonymous with the {@code finally} clause in a synchronous API:
   *
   *     // Synchronous API:
   *     try {
   *       doSynchronousWork();
   *     } finally {
   *       cleanUp();
   *     }
   *
   *     // Asynchronous promise API:
   *     doAsynchronousWork().thenFinally(cleanUp);
   *
   * __Note:__ similar to the {@code finally} clause, if the registered
   * callback returns a rejected promise or throws an error, it will silently
   * replace the rejection error (if any) from this promise:
   *
   *     try {
   *       throw Error('one');
   *     } finally {
   *       throw Error('two');  // Hides Error: one
   *     }
   *
   *     promise.rejected(Error('one'))
   *         .thenFinally(function() {
   *           throw Error('two');  // Hides Error: one
   *         });
   *
   * @param {function(): (R|IThenable<R>)} callback The function
   *     to call when this promise is resolved.
   * @return {!promise.Promise<R>} A promise that will be fulfilled
   *     with the callback result.
   * @template R
   */
  thenFinally: function(callback) {}
});



/**
 * @enum {string}
 */
var PromiseState = {
  PENDING: 'pending',
  BLOCKED: 'blocked',
  REJECTED: 'rejected',
  FULFILLED: 'fulfilled'
};


/**
 * Internal symbol used to store a cancellation handler for
 * {@link promise.Promise} objects. This is an internal implementation detail
 * used by the {@link TaskQueue} class to monitor for when a promise is
 * cancelled without generating an extra promise via then().
 */
var CANCEL_HANDLER_SYMBOL = Symbol('on cancel');


/**
 * Represents the eventual value of a completed operation. Each promise may be
 * in one of three states: pending, fulfilled, or rejected. Each promise starts
 * in the pending state and may make a single transition to either a
 * fulfilled or rejected state, at which point the promise is considered
 * resolved.
 *
 * @implements {promise.Thenable<T>}
 * @template T
 * @see http://promises-aplus.github.io/promises-spec/
 * @unrestricted  // For using CANCEL_HANDLER_SYMBOL.
 */
promise.Promise = goog.defineClass(null, {
  /**
   * @param {function(
   *           function((T|IThenable<T>|Thenable)=),
   *           function(*=))} resolver
   *     Function that is invoked immediately to begin computation of this
   *     promise's value. The function should accept a pair of callback
   *     functions, one for fulfilling the promise and another for rejecting it.
   * @param {promise.ControlFlow=} opt_flow The control flow
   *     this instance was created under. Defaults to the currently active flow.
   */
  constructor: function(resolver, opt_flow) {
    goog.getUid(this);

    /** @private {!promise.ControlFlow} */
    this.flow_ = opt_flow || promise.controlFlow();

    /** @private {Error} */
    this.stack_ = null;
    if (promise.LONG_STACK_TRACES) {
      this.stack_ = promise.captureStackTrace(
        'Promise', 'new', promise.Promise);
    }

    /** @private {promise.Promise<?>} */
    this.parent_ = null;

    /** @private {Array<!Task>} */
    this.callbacks_ = null;

    /** @private {PromiseState} */
    this.state_ = PromiseState.PENDING;

    /** @private {boolean} */
    this.handled_ = false;

    /** @private {*} */
    this.value_ = undefined;

    /** @private {TaskQueue} */
    this.queue_ = null;

    /** @private {(function(promise.CancellationError)|null)} */
    this[CANCEL_HANDLER_SYMBOL] = null;

    try {
      var self = this;
      resolver(function(value) {
        self.resolve_(PromiseState.FULFILLED, value);
      }, function(reason) {
        self.resolve_(PromiseState.REJECTED, reason);
      });
    } catch (ex) {
      this.resolve_(PromiseState.REJECTED, ex);
    }
  },

  /** @override */
  toString: function() {
    return 'Promise::' + goog.getUid(this) +
      ' {[[PromiseStatus]]: "' + this.state_ + '"}';
  },

  /**
   * Resolves this promise. If the new value is itself a promise, this function
   * will wait for it to be resolved before notifying the registered listeners.
   * @param {PromiseState} newState The promise's new state.
   * @param {*} newValue The promise's new value.
   * @throws {TypeError} If {@code newValue === this}.
   * @private
   */
  resolve_: function(newState, newValue) {
    if (PromiseState.PENDING !== this.state_) {
      return;
    }

    if (newValue === this) {
      // See promise a+, 2.3.1
      // http://promises-aplus.github.io/promises-spec/#point-48
      newValue = new TypeError('A promise may not resolve to itself');
      newState = PromiseState.REJECTED;
    }

    this.parent_ = null;
    this.state_ = PromiseState.BLOCKED;

    if (newState !== PromiseState.REJECTED) {
      if (promise.Thenable.isImplementation(newValue)) {
        // 2.3.2
        newValue = /** @type {!promise.Thenable} */(newValue);
        newValue.then(
            this.unblockAndResolve_.bind(this, PromiseState.FULFILLED),
            this.unblockAndResolve_.bind(this, PromiseState.REJECTED));
        return;

      } else if (goog.isObject(newValue)) {
        // 2.3.3

        try {
          // 2.3.3.1
          var then = newValue['then'];
        } catch (e) {
          // 2.3.3.2
          this.state_ = PromiseState.REJECTED;
          this.value_ = e;
          this.scheduleNotifications_();
          return;
        }

        // NB: goog.isFunction is loose and will accept instanceof Function.
        if (typeof then === 'function') {
          // 2.3.3.3
          this.invokeThen_(newValue, then);
          return;
        }
      }
    }

    if (newState === PromiseState.REJECTED &&
        isError(newValue) && newValue.stack && this.stack_) {
      newValue.stack += '\nFrom: ' + (this.stack_.stack || this.stack_);
    }

    // 2.3.3.4 and 2.3.4
    this.state_ = newState;
    this.value_ = newValue;
    this.scheduleNotifications_();
  },

  /**
   * Invokes a thenable's "then" method according to 2.3.3.3 of the promise
   * A+ spec.
   * @param {!Object} x The thenable object.
   * @param {!Function} then The "then" function to invoke.
   * @private
   */
  invokeThen_: function(x, then) {
    var called = false;
    var self = this;

    var resolvePromise = function(value) {
      if (!called) {  // 2.3.3.3.3
        called = true;
        // 2.3.3.3.1
        self.unblockAndResolve_(PromiseState.FULFILLED, value);
      }
    };

    var rejectPromise = function(reason) {
      if (!called) {  // 2.3.3.3.3
        called = true;
        // 2.3.3.3.2
        self.unblockAndResolve_(PromiseState.REJECTED, reason);
      }
    };

    try {
      // 2.3.3.3
      then.call(x, resolvePromise, rejectPromise);
    } catch (e) {
      // 2.3.3.3.4.2
      rejectPromise(e);
    }
  },

  /**
   * @param {PromiseState} newState The promise's new state.
   * @param {*} newValue The promise's new value.
   * @private
   */
  unblockAndResolve_: function(newState, newValue) {
    if (this.state_ === PromiseState.BLOCKED) {
      this.state_ = PromiseState.PENDING;
      this.resolve_(newState, newValue);
    }
  },

  /**
   * @private
   */
  scheduleNotifications_: function() {
    vlog(2, () => this + ' scheduling notifications', this);

    this[CANCEL_HANDLER_SYMBOL] = null;
    if (this.value_ instanceof promise.CancellationError
        && this.value_.silent_) {
      this.callbacks_ = null;
    }

    if (!this.queue_) {
      this.queue_ = this.flow_.getActiveQueue_();
    }

    if (!this.handled_ &&
        this.state_ === PromiseState.REJECTED &&
        !(this.value_ instanceof promise.CancellationError)) {
      this.queue_.addUnhandledRejection(this);
    }
    this.queue_.scheduleCallbacks(this);
  },

  /** @override */
  cancel: function(opt_reason) {
    if (!canCancel(this)) {
      return;
    }

    if (this.parent_ && canCancel(this.parent_)) {
      this.parent_.cancel(opt_reason);
    } else {
      var reason = promise.CancellationError.wrap(opt_reason);
      if (this[CANCEL_HANDLER_SYMBOL]) {
        this[CANCEL_HANDLER_SYMBOL](reason);
        this[CANCEL_HANDLER_SYMBOL] = null;
      }

      if (this.state_ === PromiseState.BLOCKED) {
        this.unblockAndResolve_(PromiseState.REJECTED, reason);
      } else {
        this.resolve_(PromiseState.REJECTED, reason);
      }
    }

    function canCancel(promise) {
      return promise.state_ === PromiseState.PENDING
          || promise.state_ === PromiseState.BLOCKED;
    }
  },

  /** @override */
  isPending: function() {
    return this.state_ === PromiseState.PENDING;
  },

  /** @override */
  then: function(opt_callback, opt_errback) {
    return this.addCallback_(
        opt_callback, opt_errback, 'then', promise.Promise.prototype.then);
  },

  /** @override */
  thenCatch: function(errback) {
    return this.addCallback_(
        null, errback, 'thenCatch', promise.Promise.prototype.thenCatch);
  },

  /** @override */
  thenFinally: function(callback) {
    var error;
    var mustThrow = false;
    return this.then(function() {
      return callback();
    }, function(err) {
      error = err;
      mustThrow = true;
      return callback();
    }).then(function() {
      if (mustThrow) {
        throw error;
      }
    });
  },

  /**
   * Registers a new callback with this promise
   * @param {(function(T): (R|IThenable<R>)|null|undefined)} callback The
   *    fulfillment callback.
   * @param {(function(*): (R|IThenable<R>)|null|undefined)} errback The
   *    rejection callback.
   * @param {string} name The callback name.
   * @param {!Function} fn The function to use as the top of the stack when
   *     recording the callback's creation point.
   * @return {!promise.Promise<R>} A new promise which will be resolved with the
   *     esult of the invoked callback.
   * @template R
   * @private
   */
  addCallback_: function(callback, errback, name, fn) {
    if (!goog.isFunction(callback) && !goog.isFunction(errback)) {
      return this;
    }

    this.handled_ = true;
    if (this.queue_) {
      this.queue_.clearUnhandledRejection(this);
    }

    var cb = new Task(
        this.flow_,
        this.invokeCallback_.bind(this, callback, errback),
        name,
        promise.LONG_STACK_TRACES ? {name: 'Promise', top: fn} : undefined);
    cb.promise.parent_ = this;

    if (this.state_ !== PromiseState.PENDING &&
        this.state_ !== PromiseState.BLOCKED) {
      this.flow_.getActiveQueue_().enqueue(cb);
    } else {
      if (!this.callbacks_) {
        this.callbacks_ = [];
      }
      this.callbacks_.push(cb);
      cb.isVolatile = true;
      this.flow_.getActiveQueue_().enqueue(cb);
    }

    return cb.promise;
  },

  /**
   * Invokes a callback function attached to this promise.
   * @param {(function(T): (R|IThenable<R>)|null|undefined)} callback The
   *    fulfillment callback.
   * @param {(function(*): (R|IThenable<R>)|null|undefined)} errback The
   *    rejection callback.
   * @template R
   * @private
   */
  invokeCallback_: function(callback, errback) {
    var callbackFn = callback;
    if (this.state_ === PromiseState.REJECTED) {
      callbackFn = errback;
    }

    if (goog.isFunction(callbackFn)) {
      if (promise.isGenerator(callbackFn)) {
        return promise.consume(callbackFn, null, this.value_);
      }
      return callbackFn(this.value_);
    } else if (this.state_ === PromiseState.REJECTED) {
      throw this.value_;
    } else {
      return this.value_;
    }
  }
});
promise.Thenable.addImplementation(promise.Promise);


/**
 * Represents a value that will be resolved at some point in the future. This
 * class represents the protected "producer" half of a Promise - each Deferred
 * has a {@code promise} property that may be returned to consumers for
 * registering callbacks, reserving the ability to resolve the deferred to the
 * producer.
 *
 * If this Deferred is rejected and there are no listeners registered before
 * the next turn of the event loop, the rejection will be passed to the
 * {@link webdriver.promise.ControlFlow} as an unhandled failure.
 *
 * @implements {promise.Thenable<T>}
 * @template T
 */
promise.Deferred = goog.defineClass(null, {
  /**
   * @param {promise.ControlFlow=} opt_flow The control flow this instance was
   *     created under. This should only be provided during unit tests.
   */
  constructor: function(opt_flow) {
    var fulfill, reject;

    /** @type {!promise.Promise<T>} */
    this.promise = new promise.Promise(function(f, r) {
      fulfill = f;
      reject = r;
    }, opt_flow);

    var self = this;
    var checkNotSelf = function(value) {
      if (value === self) {
        throw new TypeError('May not resolve a Deferred with itself');
      }
    };

    /**
     * Resolves this deferred with the given value. It is safe to call this as a
     * normal function (with no bound "this").
     * @param {(T|IThenable<T>|Thenable)=} opt_value The fulfilled value.
     */
    this.fulfill = function(opt_value) {
      checkNotSelf(opt_value);
      fulfill(opt_value);
    };

    /**
     * Rejects this promise with the given reason. It is safe to call this as a
     * normal function (with no bound "this").
     * @param {*=} opt_reason The rejection reason.
     */
    this.reject = function(opt_reason) {
      checkNotSelf(opt_reason);
      reject(opt_reason);
    };
  },

  /** @override */
  isPending: function() {
    return this.promise.isPending();
  },

  /** @override */
  cancel: function(opt_reason) {
    this.promise.cancel(opt_reason);
  },

  /**
   * @override
   * @deprecated Use {@code then} from the promise property directly.
   */
  then: function(opt_cb, opt_eb) {
    return this.promise.then(opt_cb, opt_eb);
  },

  /**
   * @override
   * @deprecated Use {@code thenCatch} from the promise property directly.
   */
  thenCatch: function(opt_eb) {
    return this.promise.thenCatch(opt_eb);
  },

  /**
   * @override
   * @deprecated Use {@code thenFinally} from the promise property directly.
   */
  thenFinally: function(opt_cb) {
    return this.promise.thenFinally(opt_cb);
  }
});
promise.Thenable.addImplementation(promise.Deferred);


/**
 * Tests if a value is an Error-like object. This is more than an straight
 * instanceof check since the value may originate from another context.
 * @param {*} value The value to test.
 * @return {boolean} Whether the value is an error.
 */
function isError(value) {
  return value instanceof Error ||
      goog.isObject(value) &&
      (goog.isString(value.message) ||
       // A special test for goog.testing.JsUnitException.
       value.isJsUnitException);

}


/**
 * Determines whether a {@code value} should be treated as a promise.
 * Any object whose "then" property is a function will be considered a promise.
 *
 * @param {*} value The value to test.
 * @return {boolean} Whether the value is a promise.
 */
promise.isPromise = function(value) {
  return !!value && goog.isObject(value) &&
      // Use array notation so the Closure compiler does not obfuscate away our
      // contract. Use typeof rather than goog.isFunction because
      // goog.isFunction accepts instanceof Function, which the promise spec
      // does not.
      typeof value['then'] === 'function';
};


/**
 * Creates a promise that will be resolved at a set time in the future.
 * @param {number} ms The amount of time, in milliseconds, to wait before
 *     resolving the promise.
 * @return {!promise.Promise} The promise.
 */
promise.delayed = function(ms) {
  var key;
  return new promise.Promise(function(fulfill) {
    key = setTimeout(function() {
      key = null;
      fulfill();
    }, ms);
  }).thenCatch(function(e) {
    clearTimeout(key);
    key = null;
    throw e;
  });
};


/**
 * Creates a new deferred object.
 * @return {!promise.Deferred<T>} The new deferred object.
 * @template T
 */
promise.defer = function() {
  return new promise.Deferred();
};


/**
 * Creates a promise that has been resolved with the given value.
 * @param {T=} opt_value The resolved value.
 * @return {!promise.Promise<T>} The resolved promise.
 * @template T
 */
promise.fulfilled = function(opt_value) {
  if (opt_value instanceof promise.Promise) {
    return opt_value;
  }
  return new promise.Promise(function(fulfill) {
    fulfill(opt_value);
  });
};


/**
 * Creates a promise that has been rejected with the given reason.
 * @param {*=} opt_reason The rejection reason; may be any value, but is
 *     usually an Error or a string.
 * @return {!promise.Promise<T>} The rejected promise.
 * @template T
 */
promise.rejected = function(opt_reason) {
  if (opt_reason instanceof promise.Promise) {
    return opt_reason;
  }
  return new promise.Promise(function(_, reject) {
    reject(opt_reason);
  });
};


/**
 * Wraps a function that expects a node-style callback as its final
 * argument. This callback expects two arguments: an error value (which will be
 * null if the call succeeded), and the success value as the second argument.
 * The callback will the resolve or reject the returned promise, based on its arguments.
 * @param {!Function} fn The function to wrap.
 * @param {...?} var_args The arguments to apply to the function, excluding the
 *     final callback.
 * @return {!promise.Promise} A promise that will be resolved with the
 *     result of the provided function's callback.
 */
promise.checkedNodeCall = function(fn, var_args) {
  var args = Arrays.slice(arguments, 1);
  return new promise.Promise(function(fulfill, reject) {
    try {
      args.push(function(error, value) {
        error ? reject(error) : fulfill(value);
      });
      fn.apply(undefined, args);
    } catch (ex) {
      reject(ex);
    }
  });
};


/**
 * Registers an observer on a promised {@code value}, returning a new promise
 * that will be resolved when the value is. If {@code value} is not a promise,
 * then the return promise will be immediately resolved.
 * @param {*} value The value to observe.
 * @param {Function=} opt_callback The function to call when the value is
 *     resolved successfully.
 * @param {Function=} opt_errback The function to call when the value is
 *     rejected.
 * @return {!promise.Promise} A new promise.
 */
promise.when = function(value, opt_callback, opt_errback) {
  if (promise.Thenable.isImplementation(value)) {
    return value.then(opt_callback, opt_errback);
  }

  return new promise.Promise(function(fulfill, reject) {
    promise.asap(value, fulfill, reject);
  }).then(opt_callback, opt_errback);
};


/**
 * Invokes the appropriate callback function as soon as a promised
 * {@code value} is resolved. This function is similar to
 * {@link webdriver.promise.when}, except it does not return a new promise.
 * @param {*} value The value to observe.
 * @param {Function} callback The function to call when the value is
 *     resolved successfully.
 * @param {Function=} opt_errback The function to call when the value is
 *     rejected.
 */
promise.asap = function(value, callback, opt_errback) {
  if (promise.isPromise(value)) {
    value.then(callback, opt_errback);

  // Maybe a Dojo-like deferred object?
  } else if (!!value && goog.isObject(value) &&
      goog.isFunction(value.addCallbacks)) {
    value.addCallbacks(callback, opt_errback);

  // A raw value, return a resolved promise.
  } else if (callback) {
    callback(value);
  }
};


/**
 * Given an array of promises, will return a promise that will be fulfilled
 * with the fulfillment values of the input array's values. If any of the
 * input array's promises are rejected, the returned promise will be rejected
 * with the same reason.
 *
 * @param {!Array<(T|!promise.Promise<T>)>} arr An array of
 *     promises to wait on.
 * @return {!promise.Promise<!Array<T>>} A promise that is
 *     fulfilled with an array containing the fulfilled values of the
 *     input array, or rejected with the same reason as the first
 *     rejected value.
 * @template T
 */
promise.all = function(arr) {
  return new promise.Promise(function(fulfill, reject) {
    var n = arr.length;
    var values = [];

    if (!n) {
      fulfill(values);
      return;
    }

    var toFulfill = n;
    var onFulfilled = function(index, value) {
      values[index] = value;
      toFulfill--;
      if (toFulfill == 0) {
        fulfill(values);
      }
    };

    for (var i = 0; i < n; ++i) {
      promise.asap(arr[i], goog.partial(onFulfilled, i), reject);
    }
  });
};


/**
 * Calls a function for each element in an array and inserts the result into a
 * new array, which is used as the fulfillment value of the promise returned
 * by this function.
 *
 * If the return value of the mapping function is a promise, this function
 * will wait for it to be fulfilled before inserting it into the new array.
 *
 * If the mapping function throws or returns a rejected promise, the
 * promise returned by this function will be rejected with the same reason.
 * Only the first failure will be reported; all subsequent errors will be
 * silently ignored.
 *
 * @param {!(Array<TYPE>|promise.Promise<!Array<TYPE>>)} arr The
 *     array to iterator over, or a promise that will resolve to said array.
 * @param {function(this: SELF, TYPE, number, !Array<TYPE>): ?} fn The
 *     function to call for each element in the array. This function should
 *     expect three arguments (the element, the index, and the array itself.
 * @param {SELF=} opt_self The object to be used as the value of 'this' within
 *     {@code fn}.
 * @template TYPE, SELF
 */
promise.map = function(arr, fn, opt_self) {
  return promise.fulfilled(arr).then(function(v) {
    goog.asserts.assertNumber(v.length, 'not an array like value');
    var arr = /** @type {!Array} */(v);
    return new promise.Promise(function(fulfill, reject) {
      var n = arr.length;
      var values = new Array(n);
      (function processNext(i) {
        for (; i < n; i++) {
          if (i in arr) {
            break;
          }
        }
        if (i >= n) {
          fulfill(values);
          return;
        }
        try {
          promise.asap(
              fn.call(opt_self, arr[i], i, /** @type {!Array} */(arr)),
              function(value) {
                values[i] = value;
                processNext(i + 1);
              },
              reject);
        } catch (ex) {
          reject(ex);
        }
      })(0);
    });
  });
};


/**
 * Calls a function for each element in an array, and if the function returns
 * true adds the element to a new array.
 *
 * If the return value of the filter function is a promise, this function
 * will wait for it to be fulfilled before determining whether to insert the
 * element into the new array.
 *
 * If the filter function throws or returns a rejected promise, the promise
 * returned by this function will be rejected with the same reason. Only the
 * first failure will be reported; all subsequent errors will be silently
 * ignored.
 *
 * @param {!(Array<TYPE>|promise.Promise<!Array<TYPE>>)} arr The
 *     array to iterator over, or a promise that will resolve to said array.
 * @param {function(this: SELF, TYPE, number, !Array<TYPE>): (
 *             boolean|promise.Promise<boolean>)} fn The function
 *     to call for each element in the array.
 * @param {SELF=} opt_self The object to be used as the value of 'this' within
 *     {@code fn}.
 * @template TYPE, SELF
 */
promise.filter = function(arr, fn, opt_self) {
  return promise.fulfilled(arr).then(function(v) {
    goog.asserts.assertNumber(v.length, 'not an array like value');
    var arr = /** @type {!Array} */(v);
    return new promise.Promise(function(fulfill, reject) {
      var n = arr.length;
      var values = [];
      var valuesLength = 0;
      (function processNext(i) {
        for (; i < n; i++) {
          if (i in arr) {
            break;
          }
        }
        if (i >= n) {
          fulfill(values);
          return;
        }
        try {
          var value = arr[i];
          var include = fn.call(opt_self, value, i, /** @type {!Array} */(arr));
          promise.asap(include, function(include) {
            if (include) {
              values[valuesLength++] = value;
            }
            processNext(i + 1);
            }, reject);
        } catch (ex) {
          reject(ex);
        }
      })(0);
    });
  });
};


/**
 * Returns a promise that will be resolved with the input value in a
 * fully-resolved state. If the value is an array, each element will be fully
 * resolved. Likewise, if the value is an object, all keys will be fully
 * resolved. In both cases, all nested arrays and objects will also be
 * fully resolved.  All fields are resolved in place; the returned promise will
 * resolve on {@code value} and not a copy.
 *
 * Warning: This function makes no checks against objects that contain
 * cyclical references:
 *
 *     var value = {};
 *     value['self'] = value;
 *     promise.fullyResolved(value);  // Stack overflow.
 *
 * @param {*} value The value to fully resolve.
 * @return {!promise.Promise} A promise for a fully resolved version
 *     of the input value.
 */
promise.fullyResolved = function(value) {
  if (promise.isPromise(value)) {
    return promise.when(value, fullyResolveValue);
  }
  return fullyResolveValue(value);
};


/**
 * @param {*} value The value to fully resolve. If a promise, assumed to
 *     already be resolved.
 * @return {!promise.Promise} A promise for a fully resolved version
 *     of the input value.
 */
 function fullyResolveValue(value) {
  switch (goog.typeOf(value)) {
    case 'array':
      return fullyResolveKeys(/** @type {!Array} */ (value));

    case 'object':
      if (promise.isPromise(value)) {
        // We get here when the original input value is a promise that
        // resolves to itself. When the user provides us with such a promise,
        // trust that it counts as a "fully resolved" value and return it.
        // Of course, since it's already a promise, we can just return it
        // to the user instead of wrapping it in another promise.
        return /** @type {!promise.Promise} */ (value);
      }

      if (goog.isNumber(value.nodeType) &&
          goog.isObject(value.ownerDocument) &&
          goog.isNumber(value.ownerDocument.nodeType)) {
        // DOM node; return early to avoid infinite recursion. Should we
        // only support objects with a certain level of nesting?
        return promise.fulfilled(value);
      }

      return fullyResolveKeys(/** @type {!Object} */ (value));

    default:  // boolean, function, null, number, string, undefined
      return promise.fulfilled(value);
  }
}


/**
 * @param {!(Array|Object)} obj the object to resolve.
 * @return {!promise.Promise} A promise that will be resolved with the
 *     input object once all of its values have been fully resolved.
 */
 function fullyResolveKeys(obj) {
  var isArray = goog.isArray(obj);
  var numKeys = isArray ? obj.length : Objects.getCount(obj);
  if (!numKeys) {
    return promise.fulfilled(obj);
  }

  var numResolved = 0;
  return new promise.Promise(function(fulfill, reject) {
    // In pre-IE9, goog.array.forEach will not iterate properly over arrays
    // containing undefined values because "index in array" returns false
    // when array[index] === undefined (even for x = [undefined, 1]). To get
    // around this, we need to use our own forEach implementation.
    // DO NOT REMOVE THIS UNTIL WE NO LONGER SUPPORT IE8. This cannot be
    // reproduced in IE9 by changing the browser/document modes, it requires an
    // actual pre-IE9 browser.  Yay, IE!
    var forEachKey = !isArray ? Objects.forEach : function(arr, fn) {
      var n = arr.length;
      for (var i = 0; i < n; ++i) {
        fn.call(null, arr[i], i, arr);
      }
    };

    forEachKey(obj, function(partialValue, key) {
      var type = goog.typeOf(partialValue);
      if (type != 'array' && type != 'object') {
        maybeResolveValue();
        return;
      }

      promise.fullyResolved(partialValue).then(
          function(resolvedValue) {
            obj[key] = resolvedValue;
            maybeResolveValue();
          },
          reject);
    });

    function maybeResolveValue() {
      if (++numResolved == numKeys) {
        fulfill(obj);
      }
    }
  });
}


//////////////////////////////////////////////////////////////////////////////
//
//  promise.ControlFlow
//
//////////////////////////////////////////////////////////////////////////////



/**
 * Handles the execution of scheduled tasks, each of which may be an
 * asynchronous operation. The control flow will ensure tasks are executed in
 * the ordered scheduled, starting each task only once those before it have
 * completed.
 *
 * Each task scheduled within this flow may return a
 * {@link webdriver.promise.Promise} to indicate it is an asynchronous
 * operation. The ControlFlow will wait for such promises to be resolved before
 * marking the task as completed.
 *
 * Tasks and each callback registered on a {@link webdriver.promise.Promise}
 * will be run in their own ControlFlow frame.  Any tasks scheduled within a
 * frame will take priority over previously scheduled tasks. Furthermore, if any
 * of the tasks in the frame fail, the remainder of the tasks in that frame will
 * be discarded and the failure will be propagated to the user through the
 * callback/task's promised result.
 *
 * Each time a ControlFlow empties its task queue, it will fire an
 * {@link webdriver.promise.ControlFlow.EventType.IDLE IDLE} event. Conversely,
 * whenever the flow terminates due to an unhandled error, it will remove all
 * remaining tasks in its queue and fire an
 * {@link webdriver.promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION
 * UNCAUGHT_EXCEPTION} event. If there are no listeners registered with the
 * flow, the error will be rethrown to the global error handler.
 *
 * Refer to the {@link webdriver.promise} module documentation for a detailed
 * explanation of how the ControlFlow coordinates task execution.
 *
 * @final
 */
promise.ControlFlow = goog.defineClass(EventEmitter, {
  // TODO: remove this empty comment when the compiler properly handles
  // goog.defineClass with a missing constructor comment.
  /** @constructor */
  constructor: function() {
    promise.ControlFlow.base(this, 'constructor');

    /** @private {boolean} */
    this.propagateUnhandledRejections_ = true;

    /** @private {TaskQueue} */
    this.activeQueue_ = null;

    /** @private {Set<TaskQueue>} */
    this.taskQueues_ = null;

    /**
     * Micro task that controls shutting down the control flow. Upon shut down,
     * the flow will emit an
     * {@link webdriver.promise.ControlFlow.EventType.IDLE} event. Idle events
     * always follow a brief timeout in order to catch latent errors from the
     * last completed task. If this task had a callback registered, but no
     * errback, and the task fails, the unhandled failure would not be reported
     * by the promise system until the next turn of the event loop:
     *
     *   // Schedule 1 task that fails.
     *   var result = promise.controlFlow().schedule('example',
     *       function() { return promise.rejected('failed'); });
     *   // Set a callback on the result. This delays reporting the unhandled
     *   // failure for 1 turn of the event loop.
     *   result.then(goog.nullFunction);
     *
     * @private {MicroTask}
     */
    this.shutdownTask_ = null;

    /**
     * ID for a long running interval used to keep a Node.js process running
     * while a control flow's event loop is still working. This is a cheap hack
     * required since JS events are only scheduled to run when there is
     * _actually_ something to run. When a control flow is waiting on a task,
     * there will be nothing in the JS event loop and the process would
     * terminate without this.
     *
     * @private {?number}
     */
    this.hold_ = null;
  },

  /**
   * Returns a string representation of this control flow, which is its current
   * {@link #getSchedule() schedule}, sans task stack traces.
   * @return {string} The string representation of this contorl flow.
   * @override
   */
  toString: function() {
    return this.getSchedule();
  },

  /**
   * Sets whether any unhandled rejections should propagate up through the
   * control flow stack and cause rejections within parent tasks. If error
   * propagation is disabled, tasks will not be aborted when an unhandled
   * promise rejection is detected, but the rejection _will_ trigger an
   * {@link webdriver.promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION}
   * event.
   *
   * The default behavior is to propagate all unhandled rejections. _The use
   * of this option is highly discouraged._
   *
   * @param {boolean} propagate whether to propagate errors.
   */
  setPropagateUnhandledRejections: function(propagate) {
    this.propagateUnhandledRejections_ = propagate;
  },

  /**
   * @return {boolean} Whether this flow is currently idle.
   */
  isIdle: function() {
    return !this.shutdownTask_ && (!this.taskQueues_ || !this.taskQueues_.size);
  },

  /**
   * Resets this instance, clearing its queue and removing all event listeners.
   */
  reset: function() {
    this.cancelQueues_(new FlowResetError);
    this.emit(promise.ControlFlow.EventType.RESET);
    this.removeAllListeners();
    this.cancelShutdown_();
  },

  /**
   * Generates an annotated string describing the internal state of this control
   * flow, including the currently executing as well as pending tasks. If
   * {@code opt_includeStackTraces === true}, the string will include the
   * stack trace from when each task was scheduled.
   * @param {string=} opt_includeStackTraces Whether to include the stack traces
   *     from when each task was scheduled. Defaults to false.
   * @return {string} String representation of this flow's internal state.
   */
  getSchedule: function(opt_includeStackTraces) {
    var ret = 'ControlFlow::' + goog.getUid(this);
    var activeQueue = this.activeQueue_;
    if (!this.taskQueues_ || !this.taskQueues_.size) {
      return ret;
    }
    var childIndent = '| ';
    for (var q of this.taskQueues_) {
      ret += '\n' + printQ(q, childIndent);
    }
    return ret;

    function printQ(q, indent) {
      var ret = q.toString();
      if (q === activeQueue) {
        ret = '(active) ' + ret;
      }
      var prefix = indent + childIndent;
      if (q.pending_) {
        if (q.pending_.q.state_ !== TaskQueueState.FINISHED) {
          ret += '\n' + prefix + '(pending) ' + q.pending_.task;
          ret += '\n' + printQ(q.pending_.q, prefix + childIndent);
        } else {
          ret += '\n' + prefix + '(blocked) ' + q.pending_.task;
        }
      }
      if (q.interrupts_) {
        q.interrupts_.forEach((task) => {
          ret += '\n' + prefix + task;
        });
      }
      if (q.tasks_) {
        q.tasks_.forEach((task) => ret += printTask(task, '\n' + prefix));
      }
      return indent + ret;
    }

    function printTask(task, prefix) {
      var ret = prefix + task;
      if (opt_includeStackTraces && task.promise.stack_) {
        ret += prefix + childIndent
            + (task.promise.stack_.stack || task.promise.stack_)
                  .replace(/\n/g, prefix);
      }
      return ret;
    }
  },

  /**
   * Returns the currently actively task queue for this flow. If there is no
   * active queue, one will be created.
   * @return {!TaskQueue} the currently active task queue for this flow.
   * @private
   */
  getActiveQueue_: function() {
    if (this.activeQueue_) {
      return this.activeQueue_;
    }

    this.activeQueue_ = new TaskQueue(this);
    if (!this.taskQueues_) {
      this.taskQueues_ = new Set();
    }
    this.taskQueues_.add(this.activeQueue_);
    this.activeQueue_
        .once('end', this.onQueueEnd_, this)
        .once('error', this.onQueueError_, this);

    asyncRun(() => this.activeQueue_ = null, this);
    this.activeQueue_.start();
    return this.activeQueue_;
  },

  /**
   * Schedules a task for execution. If there is nothing currently in the
   * queue, the task will be executed in the next turn of the event loop. If
   * the task function is a generator, the task will be executed using
   * {@link webdriver.promise.consume}.
   *
   * @param {function(): (T|promise.Promise<T>)} fn The function to
   *     call to start the task. If the function returns a
   *     {@link webdriver.promise.Promise}, this instance will wait for it to be
   *     resolved before starting the next task.
   * @param {string=} opt_description A description of the task.
   * @return {!promise.Promise<T>} A promise that will be resolved
   *     with the result of the action.
   * @template T
   */
  execute: function(fn, opt_description) {
    if (promise.isGenerator(fn)) {
      fn = goog.partial(promise.consume, fn);
    }

    if (!this.hold_) {
      var holdIntervalMs = 2147483647;  // 2^31-1; max timer length for Node.js
      this.hold_ = setInterval(goog.nullFunction, holdIntervalMs);
    }

    var task = new Task(
        this, fn, opt_description || '<anonymous>',
        {name: 'Task', top: promise.ControlFlow.prototype.execute});

    var q = this.getActiveQueue_();
    q.enqueue(task);
    this.emit(promise.ControlFlow.EventType.SCHEDULE_TASK, task.description);
    return task.promise;
  },

  /**
   * Inserts a {@code setTimeout} into the command queue. This is equivalent to
   * a thread sleep in a synchronous programming language.
   *
   * @param {number} ms The timeout delay, in milliseconds.
   * @param {string=} opt_description A description to accompany the timeout.
   * @return {!promise.Promise} A promise that will be resolved with
   *     the result of the action.
   */
  timeout: function(ms, opt_description) {
    return this.execute(function() {
      return promise.delayed(ms);
    }, opt_description);
  },

  /**
   * Schedules a task that shall wait for a condition to hold. Each condition
   * function may return any value, but it will always be evaluated as a
   * boolean.
   *
   * Condition functions may schedule sub-tasks with this instance, however,
   * their execution time will be factored into whether a wait has timed out.
   *
   * In the event a condition returns a Promise, the polling loop will wait for
   * it to be resolved before evaluating whether the condition has been
   * satisfied. The resolution time for a promise is factored into whether a
   * wait has timed out.
   *
   * If the condition function throws, or returns a rejected promise, the
   * wait task will fail.
   *
   * If the condition is defined as a promise, the flow will wait for it to
   * settle. If the timeout expires before the promise settles, the promise
   * returned by this function will be rejected.
   *
   * If this function is invoked with `timeout === 0`, or the timeout is
   * omitted, the flow will wait indefinitely for the condition to be satisfied.
   *
   * @param {(!promise.Promise<T>|function())} condition The condition to poll,
   *     or a promise to wait on.
   * @param {number=} opt_timeout How long to wait, in milliseconds, for the
   *     condition to hold before timing out. If omitted, the flow will wait
   *     indefinitely.
   * @param {string=} opt_message An optional error message to include if the
   *     wait times out; defaults to the empty string.
   * @return {!promise.Promise<T>} A promise that will be fulfilled
   *     when the condition has been satisified. The promise shall be rejected
   *     if the wait times out waiting for the condition.
   * @throws {TypeError} If condition is not a function or promise or if timeout
   *     is not a number >= 0.
   * @template T
   */
  wait: function(condition, opt_timeout, opt_message) {
    var timeout = opt_timeout || 0;
    if (!goog.isNumber(timeout) || timeout < 0) {
      throw TypeError('timeout must be a number >= 0: ' + timeout);
    }

    if (promise.isPromise(condition)) {
      return this.execute(function() {
        if (!timeout) {
          return condition;
        }
        return new promise.Promise(function(fulfill, reject) {
          var start = goog.now();
          var timer = setTimeout(function() {
            timer = null;
            reject(Error((opt_message ? opt_message + '\n' : '') +
                         'Timed out waiting for promise to resolve after ' +
                         (goog.now() - start) + 'ms'));
          }, timeout);

          /** @type {Thenable} */(condition).then(
            function(value) {
              timer && clearTimeout(timer);
              fulfill(value);
            },
            function(error) {
              timer && clearTimeout(timer);
              reject(error);
            });
        });
      }, opt_message || '<anonymous wait: promise resolution>');
    }

    if (!goog.isFunction(condition)) {
      throw TypeError('Invalid condition; must be a function or promise: ' +
                      goog.typeOf(condition));
    }

    if (promise.isGenerator(condition)) {
      condition = goog.partial(promise.consume, condition);
    }

    var self = this;
    return this.execute(function() {
      var startTime = goog.now();
      return new promise.Promise(function(fulfill, reject) {
        pollCondition();

        function pollCondition() {
          var conditionFn = /** @type {function()} */(condition);
          self.execute(conditionFn).then(function(value) {
            var elapsed = goog.now() - startTime;
            if (!!value) {
              fulfill(value);
            } else if (timeout && elapsed >= timeout) {
              reject(new Error((opt_message ? opt_message + '\n' : '') +
                               'Wait timed out after ' + elapsed + 'ms'));
            } else {
              // Do not use asyncRun here because we need a non-micro yield
              // here so the UI thread is given a chance when running in a
              // browser.
              setTimeout(pollCondition, 0);
            }
          }, reject);
        }
      });
    }, opt_message || '<anonymous wait>');
  },

  /**
   * Executes a function in the next available turn of the JavaScript event
   * loop. This ensures the function runs with its own task queue and any
   * scheduled tasks will run in "parallel" to those scheduled in the current
   * function.
   *
   *     flow.execute(() => console.log('a'));
   *     flow.execute(() => console.log('b'));
   *     flow.execute(() => console.log('c'));
   *     flow.async(() => {
   *        flow.execute(() => console.log('d'));
   *        flow.execute(() => console.log('e'));
   *     });
   *     flow.async(() => {
   *        flow.execute(() => console.log('f'));
   *        flow.execute(() => console.log('g'));
   *     });
   *     flow.once('idle', () => console.log('fin'));
   *     // a
   *     // d
   *     // f
   *     // b
   *     // e
   *     // g
   *     // c
   *     // fin
   *
   * If the function itself throws, the error will be treated the same as an
   * unhandled rejection within the control flow.
   *
   * __NOTE__: This function is considered _unstable_.
   *
   * @param {!Function} fn The function to execute.
   * @param {Object=} opt_self The object in whose context to run the function.
   * @param {...*} var_args Any arguments to pass to the function.
   */
  async: function(fn, opt_self, var_args) {
    asyncRun(function() {
      // Clear any lingering queues, forces getActiveQueue_ to create a new one.
      this.activeQueue_ = null;
      var q = this.getActiveQueue_();
      try {
        q.execute_(fn.bind(opt_self, var_args));
      } catch (ex) {
        var cancellationError = promise.CancellationError.wrap(ex,
            'Function passed to ControlFlow.async() threw');
        cancellationError.silent_ = true;
        q.abort_(cancellationError);
      } finally {
        this.activeQueue_ = null;
      }
    }, this);
  },

  /**
   * Event handler for when a task queue is exhausted. This starts the shutdown
   * sequence for this instance if there are no remaining task queues: after
   * one turn of the event loop, this object will emit the
   * {@link webdriver.promise.ControlFlow.EventType.IDLE IDLE} event to signal
   * listeners that it has completed. During this wait, if another task is
   * scheduled, the shutdown will be aborted.
   *
   * @param {!TaskQueue} q the completed task queue.
   * @private
   */
  onQueueEnd_: function(q) {
    if (!this.taskQueues_) {
      return;
    }
    this.taskQueues_.delete(q);

    vlog(1, () => q + ' has finished');
    vlog(1, () => this.taskQueues_.size + ' queues remain\n' + this, this);

    if (!this.taskQueues_.size) {
      asserts.assert(!this.shutdownTask_, 'Already have a shutdown task??');
      this.shutdownTask_ = new MicroTask(this.shutdown_, this);
    }
  },

  /**
   * Event handler for when a task queue terminates with an error. This triggers
   * the cancellation of all other task queues and a
   * {@link webdriver.promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION} event.
   * If there are no error event listeners registered with this instance, the
   * error will be rethrown to the global error handler.
   *
   * @param {*} error the error that caused the task queue to terminate.
   * @param {!TaskQueue} q the task queue.
   * @private
   */
  onQueueError_: function(error, q) {
    if (this.taskQueues_) {
      this.taskQueues_.delete(q);
    }
    this.cancelQueues_(promise.CancellationError.wrap(
        error, 'There was an uncaught error in the control flow'));
    this.cancelShutdown_();
    this.cancelHold_();

    var listeners = this.listeners(
      promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION);
    if (!listeners.length) {
      throwException(error);
    } else {
      this.reportUncaughtException_(error);
    }
  },

  /**
   * Cancels all remaining task queues.
   * @param {!promise.CancellationError} reason The cancellation reason.
   * @private
   */
  cancelQueues_: function(reason) {
    reason.silent_ = true;
    if (this.taskQueues_) {
      for (var q of this.taskQueues_) {
        q.removeAllListeners();
        q.abort_(reason);
      }
      this.taskQueues_.clear();
      this.taskQueues_ = null;
    }
  },

  /**
   * Reports an uncaught exception using a
   * {@link webdriver.promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION} event.
   *
   * @param {*} e the error to report.
   * @private
   */
  reportUncaughtException_: function(e) {
    this.emit(promise.ControlFlow.EventType.UNCAUGHT_EXCEPTION, e);
  },

  /** @private */
  cancelHold_: function() {
    if (this.hold_) {
      clearInterval(this.hold_);
      this.hold_ = null;
    }
  },

  /** @private */
  shutdown_: function() {
    vlog(1, () => 'Going idle: ' + this);
    this.cancelHold_();
    this.shutdownTask_ = null;
    this.emit(promise.ControlFlow.EventType.IDLE);
  },

  /**
   * Cancels the shutdown sequence if it is currently scheduled.
   * @private
   */
  cancelShutdown_: function() {
    if (this.shutdownTask_) {
      this.shutdownTask_.cancel();
      this.shutdownTask_ = null;
    }
  }
});


/**
 * Events that may be emitted by an {@link webdriver.promise.ControlFlow}.
 * @enum {string}
 */
promise.ControlFlow.EventType = {

  /** Emitted when all tasks have been successfully executed. */
  IDLE: 'idle',

  /** Emitted when a ControlFlow has been reset. */
  RESET: 'reset',

  /** Emitted whenever a new task has been scheduled. */
  SCHEDULE_TASK: 'scheduleTask',

  /**
   * Emitted whenever a control flow aborts due to an unhandled promise
   * rejection. This event will be emitted along with the offending rejection
   * reason. Upon emitting this event, the control flow will empty its task
   * queue and revert to its initial state.
   */
  UNCAUGHT_EXCEPTION: 'uncaughtException'
};


/**
 * Wraps a function to execute as a cancellable micro task.
 * @final
 */
var MicroTask = goog.defineClass(null, {
  /**
   * @param {function(this: THIS)} fn The function to run as a micro task.
   * @param {THIS=} opt_scope The scope to run the function in.
   * @template THIS
   */
  constructor: function(fn, opt_scope) {
    /** @private {boolean} */
    this.cancelled_ = false;
    asyncRun(function() {
      if (!this.cancelled_) {
        fn.call(opt_scope);
      }
    }, this);
  },

  /**
   * Cancels the execution of this task. Note: this will not prevent the task
   * timer from firing, just the invocation of the wrapped function.
   */
  cancel: function() {
    this.cancelled_ = true;
  }
});


/**
 * A task to be executed by a {@link webdriver.promise.ControlFlow}.
 *
 * @final
 */
var Task = goog.defineClass(promise.Deferred, {
  /**
   * @param {!promise.ControlFlow} flow The flow this instances belongs
   *     to.
   * @param {function(): (T|!promise.Promise<T>)} fn The function to
   *     call when the task executes. If it returns a
   *     {@link webdriver.promise.Promise}, the flow will wait for it to be
   *     resolved before starting the next task.
   * @param {string} description A description of the task for debugging.
   * @param {{name: string, top: !Function}=} opt_stackOptions Options to use
   *     when capturing the stacktrace for when this task was created.
   * @constructor
   * @extends {promise.Deferred<T>}
   * @template T
   */
  constructor: function(flow, fn, description, opt_stackOptions) {
    Task.base(this, 'constructor', flow);

    /** @type {function(): (T|!promise.Promise<T>)} */
    this.execute = fn;

    /** @type {string} */
    this.description = description;

    /** @type {TaskQueue} */
    this.queue = null;

    /**
     * Whether this task is volatile. Volatile tasks may be registered in a
     * a task queue, but will be dropped on the next turn of the JS event loop
     * if still marked volatile.
     * @type {boolean}
     */
    this.isVolatile = false;

    if (opt_stackOptions) {
      this.promise.stack_ = promise.captureStackTrace(
          opt_stackOptions.name, this.description, opt_stackOptions.top);
    }
  },

  /** @override */
  toString: function() {
    return 'Task::' + goog.getUid(this) + '<' + this.description + '>';
  }
});


/** @enum {string} */
var TaskQueueState = {
  NEW: 'new',
  STARTED: 'started',
  FINISHED: 'finished'
};


/**
 * @final
 */
var TaskQueue = goog.defineClass(EventEmitter, {
  /** @param {!promise.ControlFlow} flow . */
  constructor: function(flow) {
    TaskQueue.base(this, 'constructor');
    goog.getUid(this);

    /** @private {string} */
    this.name_ = 'TaskQueue::' + goog.getUid(this);

    /** @private {!promise.ControlFlow} */
    this.flow_ = flow;

    /** @private {!Array<!Task>} */
    this.tasks_ = [];

    /** @private {Array<!Task>} */
    this.volatileTasks_ = null;

    /** @private {Array<!Task>} */
    this.interrupts_ = null;

    /** @private {({task: !Task, q: !TaskQueue}|null)} */
    this.pending_ = null;

    /** @private {TaskQueueState} */
    this.state_ = TaskQueueState.NEW;

    /** @private {!Set<!webdriver.promise.Promise>} */
    this.unhandledRejections_ = new Set();
  },

  /** @override */
  toString: function() {
    return 'TaskQueue::' + goog.getUid(this);
  },

  /**
   * @param {!webdriver.promise.Promise} promise .
   */
  addUnhandledRejection: function(promise) {
    // TODO: node 4.0.0+
    vlog(2, () => this + ' registering unhandled rejection: ' + promise, this);
    this.unhandledRejections_.add(promise);
  },

  /**
   * @param {!webdriver.promise.Promise} promise .
   */
  clearUnhandledRejection: function(promise) {
    var deleted = this.unhandledRejections_.delete(promise);
    if (deleted) {
      // TODO: node 4.0.0+
      vlog(2, () => this + ' clearing unhandled rejection: ' + promise, this);
    }
  },

  /**
   * Enqueues a new task for execution.
   * @param {!Task} task The task to enqueue.
   * @throws {Error} If this instance has already started execution.
   */
  enqueue: function(task) {
    if (this.state_ !== TaskQueueState.NEW) {
      throw Error('TaskQueue has started: ' + this);
    }

    if (task.queue) {
      throw Error('Task is already scheduled in another queue');
    }

    if (task.isVolatile) {
      this.volatileTasks_ = this.volatileTasks_ || [];
      this.volatileTasks_.push(task);
    }

    this.tasks_.push(task);
    task.queue = this;
    task.promise[CANCEL_HANDLER_SYMBOL] =
        this.onTaskCancelled_.bind(this, task);

    vlog(1, () => this + '.enqueue(' + task + ')', this);
    vlog(2, () => this.flow_.toString(), this);
  },

  /**
   * Schedules the callbacks registered on the given promise in this queue.
   *
   * @param {!promise.Promise} promise the promise whose callbacks should be
   *     registered as interrupts in this task queue.
   * @throws {Error} if this queue has already finished.
   */
  scheduleCallbacks: function(promise) {
    if (this.state_ === TaskQueueState.FINISHED) {
      throw new Error('cannot interrupt a finished q(' + this + ')');
    }

    if (this.pending_ && this.pending_.task.promise === promise) {
      this.pending_.task.promise.queue_ = null;
      this.pending_ = null;
      asyncRun(this.executeNext_, this);
    }

    if (!promise.callbacks_) {
      return;
    }
    promise.callbacks_.forEach(function(cb) {
      cb.promise[CANCEL_HANDLER_SYMBOL] =
        this.onTaskCancelled_.bind(this, cb);

      cb.isVolatile = false;
      if (cb.queue === this && this.tasks_.indexOf(cb) !== -1) {
        return;
      }

      if (cb.queue) {
        cb.queue.dropTask_(cb);
      }

      cb.queue = this;
      if (!this.interrupts_) {
        this.interrupts_ = [];
      }
      this.interrupts_.push(cb);
    }, this);
    promise.callbacks_ = null;
    vlog(2, () => this + ' interrupted\n' + this.flow_, this);
  },

  /**
   * Starts executing tasks in this queue. Once called, no further tasks may
   * be {@linkplain #enqueue() enqueued} with this instance.
   *
   * @throws {Error} if this queue has already been started.
   */
  start: function() {
    if (this.state_ !== TaskQueueState.NEW) {
      throw new Error('TaskQueue has already started');
    }
    // Always asynchronously execute next, even if there doesn't look like
    // there is anything in the queue. This will catch pending unhandled
    // rejections that were registered before start was called.
    asyncRun(this.executeNext_, this);
  },

  /**
   * Aborts this task queue. If there are any scheduled tasks, they are silently
   * cancelled and discarded (their callbacks will never fire). If this queue
   * has a _pending_ task, the abortion error is used to cancel that task.
   * Otherwise, this queue will emit an error event.
   *
   * @param {*} error The abortion reason.
   * @private
   */
  abort_: function(error) {
    var cancellation;

    if (error instanceof FlowResetError) {
      cancellation = error;
    } else {
      cancellation = new DiscardedTaskError(error);
    }

    if (this.interrupts_ && this.interrupts_.length) {
      this.interrupts_.forEach((t) => t.reject(cancellation));
      this.interrupts_ = [];
    }

    if (this.tasks_ && this.tasks_.length) {
      this.tasks_.forEach((t) => t.reject(cancellation));
      this.tasks_ = [];
    }

    if (this.pending_) {
      vlog(2, () => this + '.abort(); cancelling pending task', this);
      this.pending_.task.cancel(
          /** @type {!webdriver.promise.CancellationError} */(error));

    } else {
      vlog(2, () => this + '.abort(); emitting error event', this);
      this.emit('error', error, this);
    }
  },

  /** @private */
  executeNext_: function() {
    if (this.state_ === TaskQueueState.FINISHED) {
      return;
    }
    this.state_ = TaskQueueState.STARTED;
    this.dropVolatileTasks_();

    if (this.pending_ != null || this.processUnhandledRejections_()) {
      return;
    }

    var task;
    do {
      task = this.getNextTask_();
    } while (task && !task.promise.isPending());

    if (!task) {
      this.state_ = TaskQueueState.FINISHED;
      this.tasks_ = [];
      this.interrupts_ = null;
      vlog(2, () => this + '.emit(end)', this);
      this.emit('end', this);
      return;
    }

    var self = this;
    var subQ = new TaskQueue(this.flow_);
    subQ.once('end', () => self.onTaskComplete_(result))
        .once('error', (e) => self.onTaskFailure_(result, e));
    vlog(2, () => self + ' created ' + subQ + ' for ' + task);

    var result = undefined;
    try {
      this.pending_ = {task: task, q: subQ};
      task.promise.queue_ = this;
      result = subQ.execute_(task.execute);
      subQ.start();
    } catch (ex) {
      subQ.abort_(ex);
    }
  },


  /**
   * @param {!Function} fn .
   * @return {T} .
   * @template T
   * @private
   */
  execute_: function(fn) {
    try {
      activeFlows.push(this.flow_);
      this.flow_.activeQueue_ = this;
      return fn();
    } finally {
      this.flow_.activeQueue_ = null;
      this.dropVolatileTasks_();
      activeFlows.pop();
    }
  },

  /**
   * Process any unhandled rejections registered with this task queue. If there
   * is a rejection, this queue will be aborted with the rejection error. If
   * there are multiple rejections registered, this queue will be aborted with
   * a {@link promise.MultipleUnhandledRejectionError}.
   * @return {boolean} whether there was an unhandled rejection.
   * @private
   */
  processUnhandledRejections_: function() {
    if (!this.unhandledRejections_.size) {
      return false;
    }

    var errors = new Set();
    for (var rejection of this.unhandledRejections_) {
      errors.add(rejection.value_);
    }
    this.unhandledRejections_.clear();

    var errorToReport = errors.size === 1
        ? errors.values().next().value
        : new promise.MultipleUnhandledRejectionError(errors);

    vlog(1, () => this + ' aborting due to unhandled rejections', this);
    if (this.flow_.propagateUnhandledRejections_) {
      this.abort_(errorToReport);
      return true;
    } else {
      vlog(1, 'error propagation disabled; reporting to control flow');
      this.flow_.reportUncaughtException_(errorToReport);
      return false;
    }
  },

  /**
   * Drops any volatile tasks scheduled within this task queue.
   * @private
   */
  dropVolatileTasks_: function() {
    if (!this.volatileTasks_) {
      return;
    }
    for (var task of this.volatileTasks_) {
      if (task.isVolatile) {
        vlog(2, () => this + ' dropping volatile task ' + task, this);
        this.dropTask_(task);
      }
    }
    this.volatileTasks_ = null;
  },

  /**
   * @param {!Task} task The task to drop.
   * @private
   */
  dropTask_: function(task) {
    var index;
    if (this.interrupts_) {
      index = this.interrupts_.indexOf(task);
      if (index != -1) {
        task.queue = null;
        this.interrupts_.splice(index, 1);
        return;
      }
    }

    index = this.tasks_.indexOf(task);
    if (index != -1) {
      task.queue = null;
      this.tasks_.splice(index, 1);
    }
  },

  /**
   * @param {!Task} task The task that was cancelled.
   * @param {!promise.CancellationError} reason The cancellation reason.
   * @private
   */
  onTaskCancelled_: function(task, reason) {
    if (this.pending_ && this.pending_.task === task) {
      this.pending_.q.abort_(reason);
    } else {
      this.dropTask_(task);
    }
  },

  /**
   * @param {*} value the value originally returned by the task function.
   * @private
   */
  onTaskComplete_: function(value) {
    if (this.pending_) {
      this.pending_.task.fulfill(value);
    }
  },

  /**
   * @param {*} taskFnResult the value originally returned by the task function.
   * @param {*} error the error that caused the task function to terminate.
   * @private
   */
  onTaskFailure_: function(taskFnResult, error) {
    if (promise.Thenable.isImplementation(taskFnResult)) {
      taskFnResult.cancel(promise.CancellationError.wrap(error));
    }
    this.pending_.task.reject(error);
  },

  /**
   * @return {(Task|undefined)} the next task scheduled within this queue,
   *     if any.
   * @private
   */
  getNextTask_: function() {
    var task = undefined;
    if (this.interrupts_) {
      task = this.interrupts_.shift();
    }
    if (!task && this.tasks_) {
      task = this.tasks_.shift();
    }
    return task;
  }
});



/**
 * The default flow to use if no others are active.
 * @type {!promise.ControlFlow}
 */
var defaultFlow = new promise.ControlFlow();


/**
 * A stack of active control flows, with the top of the stack used to schedule
 * commands. When there are multiple flows on the stack, the flow at index N
 * represents a callback triggered within a task owned by the flow at index
 * N-1.
 * @type {!Array<!promise.ControlFlow>}
 */
var activeFlows = [];


/**
 * Changes the default flow to use when no others are active.
 * @param {!promise.ControlFlow} flow The new default flow.
 * @throws {Error} If the default flow is not currently active.
 */
promise.setDefaultFlow = function(flow) {
  if (activeFlows.length) {
    throw Error('You may only change the default flow while it is active');
  }
  defaultFlow = flow;
};


/**
 * @return {!promise.ControlFlow} The currently active control flow.
 */
promise.controlFlow = function() {
  return /** @type {!promise.ControlFlow} */ (
      Arrays.peek(activeFlows) || defaultFlow);
};


/**
 * Creates a new control flow. The provided callback will be invoked as the
 * first task within the new flow, with the flow as its sole argument. Returns
 * a promise that resolves to the callback result.
 * @param {function(!promise.ControlFlow)} callback The entry point
 *     to the newly created flow.
 * @return {!promise.Promise} A promise that resolves to the callback
 *     result.
 */
promise.createFlow = function(callback) {
  var flow = new promise.ControlFlow;
  return flow.execute(function() {
    return callback(flow);
  });
};


/**
 * Tests is a function is a generator.
 * @param {!Function} fn The function to test.
 * @return {boolean} Whether the function is a generator.
 */
promise.isGenerator = function(fn) {
  return fn.constructor.name === 'GeneratorFunction';
};


/**
 * Consumes a {@code GeneratorFunction}. Each time the generator yields a
 * promise, this function will wait for it to be fulfilled before feeding the
 * fulfilled value back into {@code next}. Likewise, if a yielded promise is
 * rejected, the rejection error will be passed to {@code throw}.
 *
 * __Example 1:__ the Fibonacci Sequence.
 *
 *     promise.consume(function* fibonacci() {
 *       var n1 = 1, n2 = 1;
 *       for (var i = 0; i < 4; ++i) {
 *         var tmp = yield n1 + n2;
 *         n1 = n2;
 *         n2 = tmp;
 *       }
 *       return n1 + n2;
 *     }).then(function(result) {
 *       console.log(result);  // 13
 *     });
 *
 * __Example 2:__ a generator that throws.
 *
 *     promise.consume(function* () {
 *       yield promise.delayed(250).then(function() {
 *         throw Error('boom');
 *       });
 *     }).thenCatch(function(e) {
 *       console.log(e.toString());  // Error: boom
 *     });
 *
 * @param {!Function} generatorFn The generator function to execute.
 * @param {Object=} opt_self The object to use as "this" when invoking the
 *     initial generator.
 * @param {...*} var_args Any arguments to pass to the initial generator.
 * @return {!promise.Promise<?>} A promise that will resolve to the
 *     generator's final result.
 * @throws {TypeError} If the given function is not a generator.
 */
promise.consume = function(generatorFn, opt_self, var_args) {
  if (!promise.isGenerator(generatorFn)) {
    throw new TypeError('Input is not a GeneratorFunction: ' +
        generatorFn.constructor.name);
  }

  var deferred = promise.defer();
  var generator = generatorFn.apply(opt_self, Arrays.slice(arguments, 2));
  callNext();
  return deferred.promise;

  /** @param {*=} opt_value . */
  function callNext(opt_value) {
    pump(generator.next, opt_value);
  }

  /** @param {*=} opt_error . */
  function callThrow(opt_error) {
    // Dictionary lookup required because Closure compiler's built-in
    // externs does not include GeneratorFunction.prototype.throw.
    pump(generator['throw'], opt_error);
  }

  function pump(fn, opt_arg) {
    if (!deferred.isPending()) {
      return;  // Defererd was cancelled; silently abort.
    }

    try {
      var result = fn.call(generator, opt_arg);
    } catch (ex) {
      deferred.reject(ex);
      return;
    }

    if (result.done) {
      deferred.fulfill(result.value);
      return;
    }

    promise.asap(result.value, callNext, callThrow);
  }
};

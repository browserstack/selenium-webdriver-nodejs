# browserstack-webdriver

Selenium is a browser automation library. Most often used for testing
web-applications, Selenium may be used for any task that requires automating
interaction with the browser.

## Installation

Install via npm with

    npm install browserstack-webdriver

## Usage

The sample below and others are included in the `example` directory. You may
also find the tests for browserstack-webdriver informative.

    var webdriver = require('browserstack-webdriver');
    
    // Input capabilities
    var capabilities = {
        'browserName' : 'firefox', 
        'browserstack.user' : BROWSERSTACK_USERNAME,
        'browserstack.key' : BROWSERSTACK_KEY
    }
    
    var driver = new webdriver.Builder().
      usingServer('http://hub.browserstack.com/wd/hub').
      withCapabilities(capabilities).
      build();
    
    driver.get('http://www.google.com/ncr');
    driver.findElement(webdriver.By.name('q')).sendKeys('BrowserStack');
    driver.findElement(webdriver.By.name('btnG')).click();
    
    driver.getTitle().then(function(title) {
        console.log(title);
    });
    
    driver.quit();

### Using the Builder API

The `Builder` class is your one-stop shop for configuring new WebDriver
instances. Rather than clutter your code with branches for the various browsers,
the builder lets you set all options in one flow. When you call
`Builder#build()`, all options irrelevant to the selected browser are dropped:

    var webdriver = require('browserstack-webdriver'),
        chrome = require('browserstack-webdriver/chrome'),
        firefox = require('browserstack-webdriver/firefox');

    var driver = new webdriver.Builder()
        .forBrowser('firefox')
        .setChromeOptions(/* ... */)
        .setFirefoxOptions(/* ... */)
        .build();

Why would you want to configure options irrelevant to the target browser? The
`Builder`'s API defines your _default_ configuration. You can change the target
browser at runtime through the `SELENIUM_BROWSER` environment variable. For
example, the `example/google_search.js` script is configured to run against
Firefox. You can run the example against other browsers just by changing the
runtime environment

    # cd node_modules/browserstack-webdriver
    node example/google_search
    SELENIUM_BROWSER=chrome node example/google_search
    SELENIUM_BROWSER=safari node example/google_search

## Documentation

API documentation is included in the `docs` directory and is also available
online from the [Selenium project][api]. Addition resources include

- the #selenium channel on freenode IRC
- the [selenium-users@googlegroups.com][users] list
- [SeleniumHQ](http://www.seleniumhq.org/docs/) documentation

## Issues

Please report any issues using the [Selenium issue tracker][issues]. When using
the issue tracker

- __Do__ include a detailed description of the problem.
- __Do__ include a link to a [gist](http://gist.github.com/) with any
    interesting stack traces/logs (you may also attach these directly to the bug
    report).
- __Do__ include a [reduced test case][reduction]. Reporting "unable to find
    element on the page" is _not_ a valid report - there's nothing for us to
    look into. Expect your bug report to be closed if you do not provide enough
    information for us to investigate.
- __Do not__ use the issue tracker to submit basic help requests. All help
    inquiries should be directed to the [user forum][users] or #selenium IRC
    channel.
- __Do not__ post empty "I see this too" or "Any updates?" comments. These
    provide no additional information and clutter the log.
- __Do not__ report regressions on closed bugs as they are not actively
    monitored for upates (especially bugs that are >6 months old). Please open a
    new issue and reference the original bug in your report.

## License

Licensed to the Software Freedom Conservancy (SFC) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The SFC licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.

[api]: http://selenium.googlecode.com/git/docs/api/javascript/index.html
[cla]: http://goo.gl/qC50R
[chrome]: http://chromedriver.storage.googleapis.com/index.html
[gh]: https://github.com/SeleniumHQ/selenium/
[issues]: https://github.com/SeleniumHQ/selenium/issues
[opera]: https://github.com/operasoftware/operachromiumdriver/releases
[phantomjs]: http://phantomjs.org/
[reduction]: http://www.webkit.org/quality/reduction.html
[release]: http://selenium-release.storage.googleapis.com/index.html
[users]: https://groups.google.com/forum/#!forum/selenium-users

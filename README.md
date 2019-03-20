**NOTE: THIS PROJECT HAS BEEN DEPRECATED AND IS NO LONGER ACTIVELY MAINTAINED**

For accessing *selenium-webdriver* samples please refer to [this](https://github.com/browserstack/automate-node-samples) repository.

# browserstack-webdriver

## Installation

Install the latest published version using `npm`:

    npm install browserstack-webdriver

In addition to the npm package, you will to download the WebDriver
implementations you wish to utilize. As of 2.34.0, `browserstack-webdriver`
natively supports the [ChromeDriver](http://chromedriver.storage.googleapis.com/index.html).
Simply download a copy and make sure it can be found on your `PATH`. The other
drivers (e.g. Firefox, Internet Explorer, and Safari), still require the
[standalone Selenium server](http://selenium-release.storage.googleapis.com/index.html).

### Running the tests

To run the tests, you will need to download a copy of the
[ChromeDriver](http://chromedriver.storage.googleapis.com/index.html) and make
sure it can be found on your `PATH`.

    npm test browserstack-webdriver

To run the tests against multiple browsers, download the
[Selenium server](http://selenium-release.storage.googleapis.com/index.html) and
specify its location through the `SELENIUM_SERVER_JAR` environment variable.
You can use the `SELENIUM_BROWSER` environment variable to define a
comma-separated list of browsers you wish to test against. For example:

    export SELENIUM_SERVER_JAR=path/to/selenium-server-standalone-2.33.0.jar
    SELENIUM_BROWSER=chrome,firefox npm test browserstack-webdriver

## Usage


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


## Documentation

API documentation is included in the docs module. The API documentation for the
current release are also available online from the [Selenium project](http://selenium.googlecode.com/git/docs/api/javascript/index.html "API docs"). A full user guide is available on the
[Selenium project wiki](http://code.google.com/p/selenium/wiki/WebDriverJs "User guide").

## Issues

Please report any issues using the [Selenium issue tracker](https://code.google.com/p/selenium/issues/list).

## License

Copyright 2009-2014 Software Freedom Conservancy

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

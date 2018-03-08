/*
Copyright (c) 2018, Intel Corporation

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var assert = require('chai').assert,
    sinon = require('sinon'),
    rewire = require('rewire');

var fileToTest = "../../../lib/cfenv/reader.js";

var fakeConfig = {
    port: "443",
    hostname: "streammyiot.com"
};

var fakeOs = {
    hostname: function(){
        return fakeConfig.hostname;
    }
};

var fakeVcap_services = {
    "cre": {"credentials": "mycredential"}
};

var fakeAppEnv = {
    url: "https://streammyiot.com",
    port: fakeConfig.port
}

describe(fileToTest, function(){
    var toTest = rewire(fileToTest);

    it('Shall get credentials', function(done){
        toTest.__set__("vcap_services", fakeVcap_services);
        assert.equal(toTest.getServiceCredentials("cre"), "mycredential", "get right credential");
        done();
    });

    it('Shall get empty credentials', function(done){
        toTest.__set__("vcap_services", fakeVcap_services);
        assert.deepEqual(toTest.getServiceCredentials("abc"), {}, "get empty credential");
        done();
    });

    it('Shall get url', function(done){
        toTest.__set__("appEnv", fakeAppEnv);
        assert.equal(toTest.getApplicationUri (), "streammyiot.com", "get app url");
        done();
    });

    it('Shall get Port', function(done){
        toTest.__set__("appEnv", fakeAppEnv);
        assert.equal(toTest.getPort(), fakeConfig.port, "get app port");
        done();
    });

    it('Shall get host', function(done){
        toTest.__set__("os", fakeOs);
        assert.equal(toTest.getHost(), fakeConfig.hostname, "get app host");
        done();
    });
    
});
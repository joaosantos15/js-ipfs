/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const series = require('async/series')
const parallel = require('async/parallel')
const waterfall = require('async/waterfall')
const bl = require('bl')

const IPFS = require('../../src/core')
const createTempRepo = require('../utils/create-repo-nodejs.js')

const IPFSAPI = require('ipfs-api')

chai.use(dirtyChai)

function setupNode (addrs) {
  return new IPFS({
    init: true,
    start: true,
    repo: createTempRepo(),
    config: {
      Addresses: {
        Swarm: addrs
      },
      Bootstrap: [],
      EXPERIMENTAL: {
        Relay: {
          Enabled: true
        }
      }
    }
  })
}

describe('circuit', function () {
  this.timeout(20 * 1000)

  let relayApi
  let ipfsWS
  let ipfsTCP
  let relayAddrs

  before((done) => {
    relayApi = new IPFSAPI(`/ip4/127.0.0.1/tcp/3107`)

    ipfsTCP = setupNode()

    ipfsWS = setupNode()

    parallel([
      (cb) => ipfsWS.on('start', cb),
      (cb) => ipfsTCP.on('start', cb),
      (cb) => relayApi.id(cb)
    ], (err, res) => {
      expect(err).to.not.exist()
      relayAddrs = res[2].addresses
      series([
        (pCb) => ipfsTCP.swarm.connect(relayAddrs[0], pCb),
        (pCb) => ipfsWS.swarm.connect(relayAddrs[1], pCb),
        (pCb) => setTimeout(pCb, 2000)
      ], (err) => {
        expect(err).to.not.exist()
        done()
      })
    })
  })

  after((done) => {
    series([
      (cb) => ipfsTCP.stop(cb),
      (cb) => ipfsWS.stop(cb)
    ], done)
  })

  it('should be able to connect over circuit', (done) => {
    ipfsTCP.swarm.connect(ipfsWS._peerInfo, (err) => {
      expect(err).to.not.exist()
      done()
    })
  })

  it('should be able to transfer data over circuit', (done) => {
    const msg = new Buffer('Hello world over circuit!')
    waterfall([
      (cb) => ipfsWS.files.add(msg, cb),
      (res, cb) => ipfsTCP.files.cat(res[0].hash, cb),
      (stream, cb) => stream.pipe(bl(cb))
    ], (err, data) => {
      expect(err).to.not.exist()
      expect(msg).to.be.eql(data)
      done()
    })
  })
})

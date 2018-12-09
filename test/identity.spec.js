import ridl from '../src/ridl'

import ecc from 'eosjs-ecc';
import * as eos from '../src/services/eos'
import { assert } from 'chai';
import 'mocha';

const host = `127.0.0.1`;
const chainId = 'cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f';
const code = 'ridlridlridl';

const privateKey = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';
const publicKey = 'EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV';
const account = {name:'eosio', authority:'active'};
const account2 = {name:'ridlridlcoin', authority:'active'};

const signProvider = signargs => signargs.sign(signargs.buf, privateKey);

const contractAuth = () =>
    ridl.init({protocol:'http', host, port:8888, chainId}, {name:'ridlridlridl', authority:'active'}, signProvider);

const userAuth = (other = false) =>
    ridl.init({protocol:'http', host, port:8888, chainId}, !other ? account : account2, signProvider);


describe('IdentityService', () => {

	ridl.identity.setSymbol('SYS');

    let identified = null;

    const reservation = {username:"hello",key:publicKey};
    const hash = ecc.sha256('ridl');

    // console.log(ecc.sha256('ridl'))

    it('should clean the contract', done => {
        new Promise(async() => {
            await contractAuth();
            await eos.contract.clean('eosio', eos.options);
            done();
        });
    });

    it('should insert some claimable reservations', done => {
        new Promise(async() => {
            await contractAuth();
            await eos.contract.seed(reservation.username, reservation.key, eos.options);
            const identity = await ridl.identity.get(reservation.username);
            assert(identity, "Could not find seeded identity");
            assert(identity.account === code, "Identity is already claimed");
            done();
        });
    });

    it('should be able to claim an identity from a reservation', done => {
        new Promise(async() => {
            await userAuth();
            const signedHash = ecc.Signature.signHash(hash, privateKey).toString();
            const identity = await ridl.identity.claim(reservation.username, publicKey, signedHash);
            assert(identity, "Identity not retrieved");
            assert(identity.account === account.name, "Identity is not registered to the new account");
            done();
        })
    });

    it('should be able to re-key an identity', done => {
        new Promise(async() => {
            await userAuth();

            const rekeyed = await ridl.identity.rekey(reservation.username, 'EOS5AwwyqQTsrMTkBbGxkbJz9vMugi7d3zHBRiGvbWv1eU4dGYc4v');
            assert(rekeyed, "Identity was not retrieved rekey");
            assert(rekeyed.key === 'EOS5AwwyqQTsrMTkBbGxkbJz9vMugi7d3zHBRiGvbWv1eU4dGYc4v', "Identity was not rekeyed");

            // Resetting to key with configured private
            await ridl.identity.rekey(reservation.username, publicKey);

            done();
        })
    });

    it('should be able to set a new account from both a key and the owner\'s account', done => {
        new Promise(async() => {
            await userAuth();

            const newname = "testacc";
            const fromAccount = await ridl.identity.setAccountFromAccount(reservation.username, newname);
            assert(fromAccount, "Identity not retrieved setaccount");
            assert(fromAccount.account === newname, "Identity is not registered to the new account");

			const signedHash = ecc.Signature.signHash(hash, privateKey).toString();
			const fromKey = await ridl.identity.setAccountFromKey(reservation.username, account.name, signedHash);
			assert(fromKey, "Identity not retrieved setaccount");
			assert(fromKey.account === account.name, "Identity is not registered to the new account");

            done();
        })
    });

    it('should be able to release an identity', done => {
        new Promise(async() => {
            await userAuth();
            const signedHash = ecc.Signature.signHash(hash, privateKey).toString();
            assert(await ridl.identity.release(reservation.username, signedHash), "Identity was not released");
            assert(!await ridl.identity.get(reservation.username), "Found released identity");
            done();
        })
    });



    it('should be able to pay for an identity and identify in a single batch transaction', done => {
        new Promise(async() => {
            await userAuth();
            const identified = await ridl.identity.payAndIdentify(reservation.username, publicKey);
            const identity = await ridl.identity.get(reservation.username);
            assert(identity, "Did not create identity");
            assert(identity.account === account.name, "Incorrectly identified");
            assert(identity.tokens === '20.0000 RIDL', "Bad initial tokens");

            done();
        })
    });

    it('should be able to load tokens into an identity', done => {
        new Promise(async() => {
            await userAuth();
            const identity = await ridl.identity.loadTokens(reservation.username, 50);
            assert(identity.tokens === '70.0000 RIDL', "Incorrect tokens: ", identity.tokens);
            done();
        })
    });

    it('should be able to load more tokens into an identity than it can hold and be refunded the overflow', done => {
        new Promise(async() => {
            await userAuth();
            const identity = await ridl.identity.loadTokens(reservation.username, 160);
            assert(identity.tokens === '100.0000 RIDL', "Incorrect tokens");
            done();
        })
    });


    it('should release the manually registered identity', done => {
        new Promise(async() => {
            const signedHash = ecc.Signature.signHash(hash, privateKey).toString();
            assert(await ridl.identity.release(reservation.username, signedHash), "Identity was not released");
            done();
        })
    })

});
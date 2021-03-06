import ridl, {FRAG_TYPES} from '../src/ridl'
import { assert } from 'chai';
import 'mocha';

import {
	userAuth,
	basicSetup,
	identitySetup,
	account2,
	account,
	username,
	username2,
	publicKey,
	network,
	contractAuth, forcetype
} from './_helpers'

const randomMemo = () => {
	const s = 'abc defg hijklmn opqr stuvwxyz'.split('');
	const r = Math.round(Math.random() * 350) + 100;
	let i = 0;
	let str = '';
	while(i < r){
		i++;
		str += s[Math.round(Math.random() * s.length)];
	}
	return str;
};

describe('ReputationService', () => {

    let reputation, reputable, fragTypes, identity;
	const EOS_MAINNET = 'eos::aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906';

	it('should setup ridl', done => {
		new Promise(async() => {
			await basicSetup();
			await identitySetup();
			await userAuth(account);
			fragTypes = await ridl.reputation.getFragmentsFor();
			assert(fragTypes.length, "Could not get frag types, are you sure you initialized the contract properly?");
			done();
		})
	});

	it('should get the identities', done => {
		new Promise(async() => {
			identity = await ridl.identity.get(username);
			assert(identity, "could not get the identity");
			done();
		})
	});

	it('should create chained reputables', done => {
		new Promise(async() => {
			const fragments = [fragTypes[0].toFragment(1)];
			await ridl.reputation.repute(username, 0, 'eosio.system', FRAG_TYPES.BLOCKCHAIN_ADDR, fragments, EOS_MAINNET);
			const parent = await ridl.reputation.searchByFingerprint(FRAG_TYPES.BLOCKCHAIN_ADDR, 'eosio.system', EOS_MAINNET);
			assert(parent, "Did not create eosio.system reputable.");

			// parent to id reputable
			const badfrags = [fragTypes.find(x => x.type === 'dangerous').toFragment(-1)];
			await ridl.reputation.repute(username, 0, 'updateauth', FRAG_TYPES.ACTION, badfrags, '', parent);
			reputable = await ridl.reputation.searchByFingerprint(FRAG_TYPES.ACTION, 'updateauth', '', parent.id);
			assert(reputable, "Did not create updateauth reputable.");
			assert(reputable.parent && reputable.parent.id === parent.id, "updateauth reputable did not have a parent.");

			// parent of parent
			await ridl.reputation.repute(username, 0, 'updateauth2', FRAG_TYPES.OTHER, badfrags, '', reputable);

			// parent to string reputable
			const noId = parent.clone();
			noId.id = -1;
			await ridl.reputation.repute(username, 0, 'regprod', FRAG_TYPES.ACTION, fragments, '', noId);
			const test1 = await ridl.reputation.searchByFingerprint(FRAG_TYPES.ACTION, 'regprod', '', parent.id);
			assert(test1, "Did not create regprod reputable.");
			assert(test1.parent && test1.parent.id === parent.id, "regprod reputable did not have a parent.");

			// auto parent creation
			await ridl.reputation.repute(username, 0, 'transfer', FRAG_TYPES.ACTION, badfrags, '', 'eosio.token::acc');
			const testParent = await ridl.reputation.searchByFingerprint(FRAG_TYPES.BLOCKCHAIN_ADDR, 'eosio.token', '', 0);
			assert(testParent, "Did not create eosio.token parent reputable.");
			const testChild = await ridl.reputation.searchByFingerprint(FRAG_TYPES.ACTION, 'transfer', '', testParent.id);
			assert(testChild, "Did not create transfer reputable.");
			assert(testChild.parent && testChild.parent.id === testParent.id, "transfer reputable did not have a parent.");
			await ridl.reputation.repute(username, 0, 'burn', FRAG_TYPES.ACTION, fragments, '', 'eosio.token::acc');
			const testChild2 = await ridl.reputation.searchByFingerprint(FRAG_TYPES.ACTION, 'burn', '', testParent.id);
			assert(testChild2, "Did not create burn reputable.");
			assert(testChild2.parent && testChild2.parent.id === testParent.id, "burn reputable did not have a parent.");
			done();
		})
	});

	it('should pull parented frag types', done => {
		new Promise(async() => {
			await forcetype('tester', reputable.parent.id);
			const frags = await ridl.reputation.getFragmentsFor(reputable.parent);
			assert(frags.some(x => x.base === reputable.parent.id), "Could not get based frag types, are you sure the entity has based frag types?");
			done();
		})
	});

    it('should be able to get an entity reputation', done => {
        new Promise(async() => {
            reputable = await ridl.reputation.getEntity(1);
            assert(reputable, "Could not find reputable by fingerprint");
            done();
        })
    })

    it('should be able to search for an entity by name', done => {
        new Promise(async() => {
            const reputables = await ridl.reputation.searchForEntity('eosio.system');
	        assert(reputables.length, "Could not find reputable by name");
            done();
        })
    })

	it('should be able to get an entity reputation with parents', done => {
		new Promise(async() => {
			const parented = await ridl.reputation.getEntity(2);
			assert(parented, "Could not find reputable by fingerprint with parents");
			done();
		})
	})

	it('should be able to search for an entity by fingerprint', done => {
		new Promise(async() => {
			const found = await ridl.reputation.searchByFingerprint('acc', 'eosio.system', EOS_MAINNET);
			assert(found, "Could not find reputable by fingerprint");
			done();
		})
	})










    it('should repute and become the mine owner', done => {
        new Promise(async() => {
	        await userAuth(account);

            const fragments = [
                fragTypes[0].toFragment(0.1),
                fragTypes[1].toFragment(-0.1),
            ];

            await ridl.reputation.repute(username, 0, 'domain.com', FRAG_TYPES.APPLICATION, fragments);
	        const r = await ridl.reputation.searchByFingerprint(FRAG_TYPES.APPLICATION, 'domain.com');
	        assert(r, "Could not get reputable (mine owner)");

	        const miners = await ridl.reputation.getMiners(r.id);
	        assert(miners.every(x => x.identity === identity.id), "Did not set the proper miners");

            done();
        })
    });

    it('should repute with another account and give taxes to the mine owner', done => {
        new Promise(async() => {
	        await userAuth(account2);

	        const before = await ridl.identity.accountBalance(account.name, true);
            const fragments = [fragTypes[0].toFragment(0.1)];
	        await ridl.reputation.repute(username2, 0, 'domain.com', FRAG_TYPES.APPLICATION, fragments);
	        const after = await ridl.identity.accountBalance(account.name, true);

	        assert(before < after, "Did not send miner tax");
	        // console.log(`Miner tax was: ${parseFloat(after - before).toFixed(4)} RIDL`)

            done();
        })
    });

	it('should create a bunch of reputables', done => {
		new Promise(async() => {
			await userAuth(account);
			const fragments = [fragTypes[0].toFragment(1)];
			const badFrags = [fragTypes.find(x => x.type === 'dangerous').toFragment(-1)];

			await ridl.reputation.repute(username, 0, 'eosio.token', FRAG_TYPES.BLOCKCHAIN_ADDR, fragments, EOS_MAINNET);
			const tokenParent = await ridl.reputation.searchByFingerprint(FRAG_TYPES.BLOCKCHAIN_ADDR, 'eosio.token', EOS_MAINNET);
			await ridl.reputation.repute(username, 0, 'transfer', FRAG_TYPES.ACTION, badFrags, '', tokenParent.id, randomMemo());
			await ridl.reputation.repute(username, 0, 'transfer', FRAG_TYPES.ACTION, [fragTypes.find(x => x.type === 'scam').toFragment(-1)], '', tokenParent.id, randomMemo());
			await ridl.reputation.repute(username, 0, 'transfer', FRAG_TYPES.ACTION, [fragTypes.find(x => x.type === 'scam').toFragment(0.5)], '', tokenParent.id, randomMemo());


			await ridl.reputation.repute(username, 0, 'eosio.token', FRAG_TYPES.BLOCKCHAIN_ADDR, fragments);


			await ridl.reputation.repute(username, 0, 'scatterfunds', FRAG_TYPES.BLOCKCHAIN_ADDR, fragments, EOS_MAINNET);
			const parent = await ridl.reputation.searchByFingerprint(FRAG_TYPES.BLOCKCHAIN_ADDR, 'scatterfunds', EOS_MAINNET);
			assert(parent, "Did not create scatterfunds reputable.");
			await ridl.reputation.repute(username, 0, 'claim', FRAG_TYPES.ACTION, badFrags, '', parent);
			await ridl.reputation.repute(username, 0, 'test', FRAG_TYPES.ACTION, badFrags, '', parent);

			// const children = await ridl.reputation.searchByParent(parent.id);
			// assert(children.length === 2, "Children not found");


			await ridl.reputation.repute(username, 0, 'get-scatter.com', FRAG_TYPES.APPLICATION, fragments);
			await ridl.reputation.repute(username, 0, 'gets-scatter.com', FRAG_TYPES.APPLICATION, [fragTypes.find(x => x.type === 'scam').toFragment(-1)]);
			await ridl.reputation.repute(username, 0, 'telosfoundation.io', FRAG_TYPES.APPLICATION, fragments);
			await ridl.reputation.repute(username, 0, 'telos-foundation.io', FRAG_TYPES.APPLICATION, [fragTypes.find(x => x.type === 'scam').toFragment(-1)]);
			await ridl.reputation.repute(username, 0, 'ridl.get-scatter.com', FRAG_TYPES.APPLICATION, [fragTypes.find(x => x.type === 'scam').toFragment(-1)]);

			await userAuth(account2);
			await ridl.reputation.repute(username2, 0, 'eosio.token', FRAG_TYPES.BLOCKCHAIN_ADDR, fragments);
			await ridl.reputation.repute(username2, 0, 'eosio.token', FRAG_TYPES.BLOCKCHAIN_ADDR, [fragTypes[1].toFragment(1)]);
			await ridl.reputation.repute(username2, 0, 'eosio.token', FRAG_TYPES.BLOCKCHAIN_ADDR, [fragTypes[2].toFragment(-1)]);
			await ridl.reputation.repute(username2, 0, 'eosio.token', FRAG_TYPES.BLOCKCHAIN_ADDR, [fragTypes[3].toFragment(1)]);
			done();
		})
	});

});
import * as eos from './eos'
import murmur from 'murmurhash';
import ReputationFragment from '../models/ReputationFragment'

const fingerprinted = str => murmur.v2(str);

export default class ReputationService {

    constructor(){}

    async repute(username, entity, fragments, details = ''){
        return eos.contract.repute(username, entity, fragments, details, eos.options);
    }

    async votetype(username, type){
        return eos.contract.votetype(username, type, eos.options);
    }

    async getEntity(entity){
        return await eos.read({
            table:'reputables',
            index:fingerprinted(entity),
            limit:1,
            firstOnly:true
        }).catch(() => null);
    }

    async getEntityReputation(entity){
        const reputation = await eos.read({
            table:'reputations',
            scope:fingerprinted(entity),
            limit:1,
            firstOnly:true
        }).catch(() => null);

        const fragTotals = await Promise.all(reputation.fragments.map(async x => {
            return eos.read({
                table:'fragtotal',
                scope:fingerprinted(x.type),
                limit:1,
                firstOnly:true
            }).catch(() => null);
        }));

        const parseAsset = asset => parseFloat(asset.split(' ')[0]);

        reputation.fragments.map(frag => {
            const totals = fragTotals.find(x => x.type === frag.type);
            frag.reputation = 0;

            const up = parseAsset(frag.up);
            const down = parseAsset(frag.down);
            const tup = parseAsset(totals.up);
            const tdown = parseAsset(totals.down);

            frag.reputation = parseFloat(((up > 0 ? (up/tup) : 0) - (down > 0 ? (down/tdown) : 0)).toFixed(4));
        });

        return reputation;
    }

    async getFragments(base = null){
        if(!!base) return eos.read({
	        table:'reptypes',
	        key_type:'i64',
	        index_position:2,
	        index:fingerprinted(base),
            search:1,
	        limit:100,
        });

        return eos.read({
            table:'reptypes',
	        key_type:'i64',
	        index_position:2,
	        index:0,
	        search:1,
            limit:100,
        })
    }

    formatFragments(fragments){
        return fragments.map(frag => new ReputationFragment(frag.type, frag.quantity))
    }
}
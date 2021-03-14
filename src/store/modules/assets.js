import { MAX_256, toBN } from 'utils/BN'

function durationPrettify(x) {
  if(x < 0) return 'Expired'
  const d = Math.floor(x / 24 / 3600000)
  const h = Math.floor(x / 3600000 % 24)
  return `${d}D ${h}H`
}

export default {
  namespaced: true,
  state: () => ({
    list:[]
  }),
  getters:{
    list({list},_,{pricer}) {

      return list.map(x => ({
        ...x,
        priceDiff: pricer[x.asset] && pricer[x.asset].sub(x.strike),
        profit: pricer[x.asset] && x.strike.sub(pricer[x.asset]).mul(x.amount)
      }))
    }
  },
  mutations:{
    push: (state, value) => state.list.push(value),
    unwrap: (state, event) => {
      const holding = state.list.find(x => x.id == event.args.tokenId && x.asset == event.asset)
      if(holding) holding.optionProfit = event.args.optionProfit
      else console.log('aaaaa', event, [...state.list])
    }
  },
  actions:{
    async processUnwrap({commit, rootState, dispatch}, {event, asset}){
      const {connection:{accounts:[account], contracts:{whETHv2, whBTCv2}}} = rootState
      console.log(123, event, asset)
      commit('unwrap', {
        ...event, asset
      })

    },
    async process({commit, rootState, dispatch}, {event, asset}){
      const {connection:{accounts:[account], contracts:{whETHv2, whBTCv2}}} = rootState
      const contract = asset == 'ETH' ? whETHv2 : whBTCv2
      const underlying = await contract.underlying(event.args.tokenId)

      const value = {
        amount: event.args.amount,
        asset,
        whAsset: asset == 'ETH' ? 'WHETH': 'WHBTC',
        decimals: asset == 'ETH' ? 18 : 8,
        strike: toBN(event.args.strike),
        id: event.args.tokenId,
        active: underlying.active,
        duration: durationPrettify(event.args.expiration * 1000 - Date.now())
      }
      console.log(event)
      commit('push', value)
    },
    async load({commit, rootState, dispatch}) {
      const {connection:{accounts:[account], contracts:{whETHv2, whBTCv2}}} = rootState

      // const BTC = whBTCv2.queryFilter(whBTCv2.filters.Wrap(account) ,0)
      const ETHWrap = await whETHv2.queryFilter(whETHv2.filters.Wrap(account) ,0)
      await Promise.all(
        ETHWrap.map(event => dispatch('process', {event, asset: 'ETH'}))
      )

      const ETHUnwrap = await whETHv2.queryFilter(whETHv2.filters.Unwrap(account) ,0)
      ETHUnwrap.forEach(event => dispatch('processUnwrap', {event, asset: 'ETH'}))

      const WBTCWrap = await whBTCv2.queryFilter(whBTCv2.filters.Wrap(account) ,0)
      await Promise.all(
        WBTCWrap.map(event => dispatch('process', {event, asset: 'WBTC'}))
      )

      const WBTCUnwrap = await whBTCv2.queryFilter(whBTCv2.filters.Unwrap(account) ,0)
      WBTCUnwrap.forEach(event => dispatch('processUnwrap', {event, asset: 'WBTC'}))
    },
    async unwrap({commit, rootState, dispatch}, {asset, id}) {
      const {connection:{accounts:[account], contracts:{whETHv2, whBTCv2}}} = rootState
      const wh = asset == 'ETH' ? whETHv2 : whBTCv2
      await wh.unwrap(id).then(x => x.wait())
    }
  }
}

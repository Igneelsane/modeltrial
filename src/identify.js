/* identify.js — dataset characterization from the role evidence (the revised brief's
   core step). Not a router: the archetype label is an OUTPUT of the evidence, and
   downstream analysis is derived from roles, never keyed to this label. */

globalThis.KPI = globalThis.KPI || {};
KPI.identify = (function () {

  const ARCH = {
    campaign: {
      label: 'Campaign performance data',
      desc: 'Per-campaign spend and results (impressions, clicks, conversions) over time.',
      weights: { campaign_dim: 0.9, cost: 0.9, outcome: 0.9, volume: 0.6, revenue: 0.5, time: 0.3 },
    },
    crm_email: {
      label: 'Email / CRM engagement data',
      desc: 'Email sends and engagement — opens, clicks, unsubscribes, bounces, orders.',
      weights: { email_signal: 0.9, segment: 0.5, outcome: 0.7, volume: 0.7, revenue: 0.5, time: 0.3, unsub_bounce: 0.7 },
    },
    web_funnel: {
      label: 'Web & funnel analytics',
      desc: 'Site traffic by source/channel — sessions, users, pageviews, goal completions.',
      weights: { channel_dim: 0.8, volume: 0.8, outcome: 0.7, revenue: 0.4, time: 0.3, rate: 0.4 },
    },
    social: {
      label: 'Social media performance data',
      desc: 'Platform-level content performance — impressions, reach, likes, comments, shares.',
      weights: { platform_dim: 0.9, engagement: 0.9, volume: 0.6, time: 0.3 },
    },
    sales_revenue: {
      label: 'Sales / revenue data',
      desc: 'Orders and transactions — order IDs, amounts, customers, products.',
      weights: { order_id: 0.9, revenue: 0.8, dim: 0.4, time: 0.3 },
    },
    other: {
      label: 'Generic business data',
      desc: 'Structured business data that doesn\u2019t match a marketing archetype — analyzed generically.',
      weights: { id: 0.4, dim: 0.4, metric: 0.4, time: 0.2 },
    },
  };

  function characterize(cleaned, roles) {
    const S = roles.summary;
    const M = S.metrics;

    const facets = {
      time: S.time.length ? { found: true, detail: 'date column(s): ' + S.time.map(t => t.header).join(', '), confidence: S.time[0].confidence } : { found: false, detail: 'no date column', confidence: null },
      campaign_dim: S.dimensions.some(d => d.identity === 'campaign') || S.ids.some(i => i.identity === 'campaign') ? { found: true, detail: 'campaign identifiers/names present', confidence: 'high' } : { found: false, detail: 'none found', confidence: null },
      channel_dim: S.dimensions.some(d => d.identity === 'channel') ? { found: true, detail: S.dimensions.filter(d => d.identity === 'channel').map(d => d.header).join(', '), confidence: 'high' } : { found: false, detail: 'none found', confidence: null },
      platform_dim: S.dimensions.some(d => d.identity === 'platform') ? { found: true, detail: S.dimensions.filter(d => d.identity === 'platform').map(d => d.header).join(', '), confidence: 'high' } : { found: false, detail: 'none found', confidence: null },
      order_id: S.ids.some(i => i.identity === 'order') ? { found: true, detail: S.ids.filter(i => i.identity === 'order').map(i => i.header).join(', '), confidence: 'high' } : { found: false, detail: 'none found', confidence: null },
      email_signal: S.texts.some(t => t.identity === 'email') || S.ids.some(i => i.identity === 'email') ? { found: true, detail: 'email-like column(s) present', confidence: 'high' } : { found: false, detail: 'no recipient/email column', confidence: null },
      segment: S.dimensions.some(d => d.identity === 'segment') ? { found: true, detail: S.dimensions.filter(d => d.identity === 'segment').map(d => d.header).join(', '), confidence: 'high' } : { found: false, detail: 'none found', confidence: null },
      cost: M.cost.length ? { found: true, detail: M.cost.map(m => m.header).join(', '), confidence: M.cost[0].confidence } : { found: false, detail: 'no cost/spend column', confidence: null },
      revenue: M.revenue.length ? { found: true, detail: M.revenue.map(m => m.header).join(', '), confidence: M.revenue[0].confidence } : { found: false, detail: 'no revenue/amount column', confidence: null },
      volume: M.volume.length ? { found: true, detail: M.volume.map(m => m.header).join(', '), confidence: M.volume[0].confidence } : { found: false, detail: 'no traffic/volume column', confidence: null },
      outcome: M.outcome.length ? { found: true, detail: M.outcome.map(m => m.header).join(', '), confidence: M.outcome[0].confidence } : { found: false, detail: 'no outcome column (conversions, orders, …)', confidence: null },
      unsub_bounce: M.outcome.some(m => m.negative) ? { found: true, detail: M.outcome.filter(m => m.negative).map(m => m.header).join(', '), confidence: 'high' } : { found: false, detail: 'none found', confidence: null },
      engagement: M.engagement.length ? { found: true, detail: M.engagement.map(m => m.header).join(', '), confidence: M.engagement[0].confidence } : { found: false, detail: 'no engagement column', confidence: null },
      rate: M.rate.length ? { found: true, detail: M.rate.map(m => m.header).join(', '), confidence: M.rate[0].confidence } : { found: false, detail: 'none found', confidence: null },
    };

    const present = f => f.found ? 1 : 0;

    // generic structural facets (for the "other" archetype)
    const hasId = S.ids.length > 0, hasDim = S.dimensions.length > 0;
    const hasMetric = [M.cost, M.revenue, M.volume, M.outcome, M.engagement, M.rate, M.stock, M.reorder, M.plain].some(a => a.length);

    const scores = {};
    scores.campaign = present(facets.campaign_dim) * ARCH.campaign.weights.campaign_dim + present(facets.cost) * ARCH.campaign.weights.cost + present(facets.outcome) * ARCH.campaign.weights.outcome + present(facets.volume) * ARCH.campaign.weights.volume + present(facets.revenue) * ARCH.campaign.weights.revenue + present(facets.time) * ARCH.campaign.weights.time;
    scores.crm_email = present(facets.email_signal) * ARCH.crm_email.weights.email_signal + present(facets.segment) * ARCH.crm_email.weights.segment + present(facets.outcome) * ARCH.crm_email.weights.outcome + present(facets.volume) * ARCH.crm_email.weights.volume + present(facets.revenue) * ARCH.crm_email.weights.revenue + present(facets.time) * ARCH.crm_email.weights.time + present(facets.unsub_bounce) * ARCH.crm_email.weights.unsub_bounce;
    scores.web_funnel = present(facets.channel_dim) * ARCH.web_funnel.weights.channel_dim + present(facets.volume) * ARCH.web_funnel.weights.volume + present(facets.outcome) * ARCH.web_funnel.weights.outcome + present(facets.revenue) * ARCH.web_funnel.weights.revenue + present(facets.time) * ARCH.web_funnel.weights.time + present(facets.rate) * ARCH.web_funnel.weights.rate;
    scores.social = present(facets.platform_dim) * ARCH.social.weights.platform_dim + present(facets.engagement) * ARCH.social.weights.engagement + present(facets.volume) * ARCH.social.weights.volume + present(facets.time) * ARCH.social.weights.time;
    scores.sales_revenue = present(facets.order_id) * ARCH.sales_revenue.weights.order_id + present(facets.revenue) * ARCH.sales_revenue.weights.revenue + (hasDim ? ARCH.sales_revenue.weights.dim : 0) + present(facets.time) * ARCH.sales_revenue.weights.time;
    scores.other = (hasId ? ARCH.other.weights.id : 0) + (hasDim ? ARCH.other.weights.dim : 0) + (hasMetric ? ARCH.other.weights.metric : 0) + present(facets.time) * ARCH.other.weights.time;

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = ranked[0], runner = ranked[1];

    // confidence: dampened runner-up + absolute evidence floor (v3.1-style honesty)
    // conf = top / (top + 0.35·runner); tiers by raw score; unclear when thin.
    let archetype = top[0], confidence = null, tier = 'none', unclear = false, unclearReason = '';
    const rel = runner[1] > 0 ? top[1] / (top[1] + 0.35 * runner[1]) : 1;

    if (top[1] >= 2.2) { confidence = Math.min(rel, 0.99); tier = 'strong'; }
    else if (top[1] >= 1.5) { confidence = Math.min(rel, 0.70); tier = 'weak'; }
    else if (top[0] === 'other' && top[1] >= 1.2) { confidence = Math.min(rel, 0.70); tier = 'weak'; }
    else {
      unclear = true; tier = 'unclear'; confidence = null;
      unclearReason = 'None of the known dataset shapes reaches the evidence threshold (raw score ' + top[1].toFixed(1) + ' of 1.5 needed). What I could confirm: ' +
        Object.entries(facets).filter(([, f]) => f.found).map(([k, f]) => k.replace(/_/g, ' ') + ' (' + f.detail + ')').join('; ') + '.';
    }

    // reasoning list for display (found facets + key absences)
    const reasoning = Object.entries(facets)
      .filter(([, f]) => f.found)
      .map(([k, f]) => ({ label: k.replace(/_/g, ' '), found: true, confidence: f.confidence, detail: f.detail }));

    return {
      archetype, label: ARCH[archetype].label, desc: ARCH[archetype].desc,
      confidence, tier, unclear, unclearReason,
      runnerUp: { archetype: runner[0], label: ARCH[runner[0]].label, score: runner[1] },
      scores, facets, reasoning,
    };
  }

  return { characterize, ARCH };
})();

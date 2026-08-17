/* roles.js — semantic role assignment. THE core of identification.
   For every column, works out on its own what the column IS — from header
   tokens, value patterns, and statistics — with per-column evidence and
   confidence. No per-dataset branches: this runs identically on any CSV. */

globalThis.KPI = globalThis.KPI || {};
KPI.roles = (function () {

  const CHANNEL_VOCAB = ['google', 'meta', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'organic', 'paid', 'direct', 'referral', 'email', 'influencer', 'affiliate', 'search', 'display', 'cpc', 'ppc', 'bing', 'quora'];
  const PLATFORM_VOCAB = ['instagram', 'linkedin', 'youtube', 'tiktok', 'facebook', 'twitter', 'pinterest', 'threads', 'snapchat'];
  const REGION_VOCAB = ['north', 'south', 'east', 'west', 'central', 'northeast', 'international', 'domestic', 'delhi', 'mumbai', 'bengaluru', 'chennai'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const URL_RE = /^(https?:\/\/|www\.)/i;
  const CODE_RE = /^[A-Za-z]{0,8}[-_]?\d{1,6}$/;

  // header tokens (headers split on non-alphanumerics, lowercased)
  const T = {
    id: ['id', 'no', 'number', 'code', 'sku'],
    rate: ['rate', 'ctr', 'cvr', 'roas', 'rpc', 'per', 'avg', 'average', 'pct', 'percent', 'index', 'score', 'ratio'],
    cost: ['spend', 'cost', 'budget', 'investment', 'adspend', 'price'],
    revenue: ['revenue', 'sales', 'gmv', 'gross', 'turnover', 'income', 'amount', 'aov', 'order_value'],
    volume: ['impressions', 'impression', 'reach', 'sessions', 'session', 'visits', 'visit', 'pageviews', 'pageview', 'views', 'view', 'clicks', 'click', 'opens', 'open', 'sent', 'delivered', 'users', 'user', 'traffic', 'unique', 'emails', 'followers'],
    outcome: ['conversion', 'conversions', 'order', 'orders', 'lead', 'leads', 'signup', 'signups', 'goalcompletions', 'goal', 'completions', 'purchase', 'purchases', 'unsubscribe', 'unsubscribes', 'bounce', 'bounces', 'cartadds', 'registration', 'registrations', 'booking', 'bookings', 'enquiry', 'enquiries'],
    engagement: ['like', 'likes', 'comment', 'comments', 'share', 'shares', 'save', 'saves', 'reply', 'replies', 'retweet', 'retweets', 'mention', 'mentions', 'engagement', 'engagements'],
    stock: ['stock', 'reorder', 'inventory', 'qty', 'quantity'],
    campaign: ['campaign'],
    channel: ['channel', 'source', 'medium', 'utm'],
    platform: ['platform', 'socialnetwork'],
    region: ['region', 'territory', 'state', 'zone', 'area', 'city', 'country'],
    segment: ['segment', 'list', 'audience', 'cohort'],
    product: ['product', 'item', 'title', 'name'],
    category: ['category', 'type', 'class', 'group'],
    warehouse: ['warehouse', 'facility', 'location', 'store'],
    order: ['order', 'invoice', 'transaction', 'purchase'],
    customer: ['customer', 'client', 'account'],
    post: ['post', 'content', 'asset', 'creative'],
    emailh: ['email', 'recipient', 'subscriber'],
  };

  function tokensOf(header) {
    return String(header).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 0);
  }
  function hasToken(tokens, list) {
    return list.some(w => tokens.includes(w));
  }
  function vocabHits(values, vocab) {
    let n = 0;
    for (const v of values) {
      const l = String(v).toLowerCase();
      if (vocab.some(t => l.includes(t))) n++;
    }
    return n;
  }

  function metricSubRole(tokens, currencyHint) {
    if (hasToken(tokens, T.rate)) return 'rate';
    if (hasToken(tokens, T.stock)) return hasToken(tokens, ['reorder']) ? 'reorder' : 'stock';
    if (hasToken(tokens, T.cost)) return 'cost';
    if (hasToken(tokens, T.revenue)) return 'revenue';
    if (hasToken(tokens, T.volume)) return 'volume';
    if (hasToken(tokens, T.outcome)) return 'outcome';
    if (hasToken(tokens, T.engagement)) return 'engagement';
    return 'plain';
  }

  function dimIdentity(tokens, values) {
    if (hasToken(tokens, T.campaign)) return 'campaign';
    if (hasToken(tokens, T.platform) || vocabHits(values, PLATFORM_VOCAB) >= 1) return 'platform';
    if (hasToken(tokens, T.channel) || vocabHits(values, CHANNEL_VOCAB) >= 1) return 'channel';
    if (hasToken(tokens, T.region) || vocabHits(values, REGION_VOCAB) >= 1) return 'region';
    if (hasToken(tokens, T.segment)) return 'segment';
    if (hasToken(tokens, T.product)) return 'product';
    if (hasToken(tokens, T.category)) return 'category';
    if (hasToken(tokens, T.warehouse)) return 'warehouse';
    if (hasToken(tokens, T.order)) return 'order';
    if (hasToken(tokens, T.customer)) return 'customer';
    if (hasToken(tokens, T.post)) return 'post';
    if (hasToken(tokens, T.emailh)) return 'email';
    return 'categorical';
  }

  function idIdentity(tokens) {
    if (hasToken(tokens, T.campaign)) return 'campaign';
    if (hasToken(tokens, T.order)) return 'order';
    if (hasToken(tokens, T.customer)) return 'customer';
    if (hasToken(tokens, T.post)) return 'post';
    if (hasToken(tokens, T.segment)) return 'segment';
    if (hasToken(tokens, T.product)) return 'product';
    if (hasToken(tokens, T.emailh)) return 'email';
    return 'identifier';
  }

  function unitFor(sub) {
    if (sub === 'cost' || sub === 'revenue') return 'currency';
    if (sub === 'rate') return 'percent';
    return 'count';
  }

  function confTag(score) { return score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low'; }

  function assign(cleaned) {
    const out = [];
    const summary = { time: [], ids: [], dimensions: [], texts: [], metrics: { cost: [], revenue: [], volume: [], outcome: [], engagement: [], rate: [], stock: [], reorder: [], plain: [] } };

    for (const col of cleaned.columns) {
      const header = col.header;
      const tokens = tokensOf(header);
      const values = col.samples || [];
      const currencyHint = /[₹$€£]/.test((col.rawSamples || []).join(' '));
      const ev = [];
      let role = null, sub = null, identity = null, negative = false, score = 0;

      if (col.type === 'date') {
        role = 'time';
        score = 0.95;
        ev.push('parses as dates (' + Math.round(col.parseRate * 100) + '%)');
        summary.time.push({ index: col.index, header, confidence: 'high', evidence: ev });
      } else if (col.type === 'numeric') {
        if (hasToken(tokens, T.id)) {
          // numeric identifier (e.g. order_id stored as integers)
          role = 'id';
          identity = idIdentity(tokens);
          score = 0.9;
          ev.push('numeric identifier column (header suggests "' + (identity === 'identifier' ? 'id' : identity) + '")');
          summary.ids.push({ index: col.index, header, identity, confidence: 'high', evidence: ev });
        } else {
          role = 'metric';
          sub = metricSubRole(tokens, currencyHint);
          if (tokens.length) { score = 0.9; ev.push('header suggests "' + sub + '"'); }
          else { score = 0.55; ev.push('numeric values only'); }
          if (sub === 'outcome' && hasToken(tokens, ['unsubscribe', 'unsubscribes', 'bounce', 'bounces'])) { negative = true; ev.push('a negative outcome (attrition)'); }
          if (sub === 'rate') ev.push('looks like a precomputed ratio, not a raw count');
          summary.metrics[sub].push({ index: col.index, header, negative, confidence: confTag(score), evidence: ev, unit: unitFor(sub), stats: col.stats });
        }
      } else if (col.type === 'string') {
        const distinctRatio = col.nonNullPct ? col.distinct / Math.max(1, col.nonNullPct * cleaned.rows.length) : 1;
        const emails = values.filter(v => EMAIL_RE.test(String(v).trim())).length;
        const urls = values.filter(v => URL_RE.test(String(v).trim())).length;
        const codeLike = values.length ? values.filter(v => CODE_RE.test(String(v).trim())).length / values.length : 0;
        if (hasToken(tokens, T.id) || (distinctRatio > 0.55 && codeLike > 0.5)) {
          role = 'id';
          identity = idIdentity(tokens);
          score = 0.9;
          ev.push('identifier column (' + col.distinct + ' distinct values)');
          if (identity !== 'identifier') ev.push('header suggests "' + identity + '"');
          summary.ids.push({ index: col.index, header, identity, confidence: 'high', evidence: ev });
        } else if (emails >= 1) {
          role = 'text'; identity = 'email';
          score = 0.9;
          ev.push(emails + ' sample value' + (emails > 1 ? 's' : '') + ' match email pattern');
          summary.texts.push({ index: col.index, header, identity: 'email', confidence: 'high', evidence: ev });
        } else if (urls >= 1) {
          role = 'text'; identity = 'url';
          score = 0.85;
          ev.push(urls + ' sample value' + (urls > 1 ? 's' : '') + ' look like URLs');
          summary.texts.push({ index: col.index, header, identity: 'url', confidence: 'high', evidence: ev });
        } else {
          role = 'dimension';
          identity = dimIdentity(tokens, values);
          score = identity === 'categorical' ? 0.6 : 0.9;
          ev.push(col.distinct + ' distinct values');
          if (identity !== 'categorical') ev.push('header/value patterns suggest "' + identity + '"');
          summary.dimensions.push({ index: col.index, header, identity, confidence: confTag(score), evidence: ev });
        }
      } else {
        continue;
      }

      out.push({ index: col.index, header, role, sub, identity, negative, confidence: confTag(score), evidence: ev, unit: sub ? unitFor(sub) : null });
    }

    return { columns: out, summary };
  }

  return { assign };
})();

/* propose.js — decision proposals derived from computed results.
   Every proposal cites the actual numbers behind it. If the data cannot ground
   a decision, that is stated explicitly in the gaps list — we never force one. */

globalThis.KPI = globalThis.KPI || {};
KPI.propose = (function () {

  function generate(results, ctx) {
    const proposals = [];
    const gaps = [];
    const S = ctx.roles.summary, M = S.metrics;
    const sample = ctx.cleaned.rows.length;
    const cap = s => sample < 30 ? 'directional' : s;
    const has = a => a && a.length;
    const money = v => KPI.interpreter.fmtValue(v, 'currency');

    /* ── gaps: what this data cannot ground ── */
    if (!has(M.cost)) gaps.push({
      title: 'Cost efficiency & ROI',
      reason: 'No cost/spend column in this dataset — cost per outcome, ROAS and budget-allocation calls cannot be grounded here.',
      unlock: 'add a spend/cost column',
    });
    if (!has(M.outcome)) gaps.push({
      title: 'Outcome performance',
      reason: 'No outcome column (conversions, orders, goal completions, …) — the dataset cannot show what actions or results were produced.',
      unlock: 'add a conversions/orders/goals column',
    });
    if (!has(M.volume)) gaps.push({
      title: 'Funnel / reach analysis',
      reason: 'No volume column (impressions, sessions, sends, …) — rates like conversion % or engagement % cannot be computed.',
      unlock: 'add a traffic/volume column',
    });
    if (!S.time.length) gaps.push({
      title: 'Trends & direction',
      reason: 'No date column — nothing can be said about direction, seasonality, or momentum.',
      unlock: 'add a date column',
    });
    if (sample < 30) gaps.push({
      title: 'Statistical reliability',
      reason: 'Only ' + sample + ' rows — every figure here is directional. Treat the numbers as indications, not measurements.',
      unlock: 'a larger dataset',
    });

    /* ── proposals from computed results ── */
    const push = (title, kind, strength, evidence) => {
      proposals.push({ title, kind, strength: cap(strength), evidence: evidence.filter(Boolean) });
    };

    // 1. allocation — cost per outcome by channel/campaign
    const cpo = results.find(r => r.kind === 'ratio' && r.id && r.id.startsWith('cpo_'));
    if (cpo && cpo.rawRows && cpo.rawRows.length >= 3 && cpo.value != null) {
      const overall = cpo.value;
      const eligible = cpo.rawRows.filter(r => r.spend > 0 && r.share >= 0.08 && r.ratio != null);
      const best = eligible.slice().sort((a, b) => a.ratio - b.ratio)[0];
      const worst = eligible.slice().sort((a, b) => b.ratio - a.ratio)[0];
      if (best && best.ratio < 0.8 * overall) {
        push('Shift budget toward ' + best.name,
          'allocation', 'high',
          [best.name + ': ' + money(best.ratio) + ' per ' + cpo.columns.outcome.toLowerCase() + ' vs ' + money(overall) + ' average (' + Math.round((1 - best.ratio / overall) * 100) + '% cheaper), ' + best.out + ' outcomes across ' + money(best.spend) + ' spend',
           'Moving share of spend toward channels with a lower cost per outcome is the highest-leverage allocation visible in this data.']);
      }
      if (worst && worst.ratio > 1.6 * overall) {
        push('Review ' + worst.name + ' spend',
          'review', 'medium',
          [worst.name + ': ' + money(worst.ratio) + ' per ' + cpo.columns.outcome.toLowerCase() + ' vs ' + money(overall) + ' average (' + Math.round((worst.ratio / overall - 1) * 100) + '% more expensive), ' + Math.round(worst.share) + '% of spend',
           'Consider pausing or renegotiating before further budget is committed.']);
      }
    }

    // 2. ROAS by channel
    const roas = results.find(r => r.kind === 'ratio' && r.id && r.id.startsWith('roas_'));
    if (roas && roas.rawRows && roas.rawRows.length >= 3 && roas.value != null) {
      const overall = roas.value;
      const eligible = roas.rawRows.filter(r => r.spend > 0 && r.share >= 0.08);
      const best = eligible.slice().sort((a, b) => (b.out / b.spend) - (a.out / a.spend))[0];
      const worst = eligible.slice().sort((a, b) => (a.out / a.spend) - (b.out / b.spend))[0];
      const bestRoas = best ? best.out / best.spend : null;
      const worstRoas = worst ? worst.out / worst.spend : null;
      if (best && bestRoas >= 1.8 * overall) {
        push('Reallocate toward ' + best.name,
          'allocation', 'high',
          [best.name + ' returns ' + KPI.interpreter.fmtValue(bestRoas, 'ratio') + ' on every ₹1 vs ' + KPI.interpreter.fmtValue(overall, 'ratio') + ' overall — the strongest return in this dataset',
           'This is a numeric call, not a suggestion: at current efficiency the same budget would return ' + KPI.interpreter.fmtValue(bestRoas / overall, 'ratio') + '× more if shifted entirely.']);
      }
      if (worst && worstRoas != null && worstRoas <= 0.5 * overall) {
        push('Reassess ' + worst.name,
          'review', 'medium',
          [worst.name + ' returns only ' + KPI.interpreter.fmtValue(worstRoas, 'ratio') + ' per ₹1 vs ' + KPI.interpreter.fmtValue(overall, 'ratio') + ' overall (' + Math.round(worst.share) + '% of spend)',
           'Lowest-return line in the dataset — worth a targeting or creative review before more budget goes in.']);
      }
    }

    // 3. trend alerts on outcome metrics (direction-aware for negative outcomes:
    //    for unsubscribes/bounces a rise is bad, a drop is good)
    for (const m of M.outcome) {
      const t = results.find(r => r.kind === 'trend' && r.columns && r.columns.metric === m.header);
      if (t && t.periods && t.periods.length >= 2) {
        const last = t.periods[t.periods.length - 1], prev = t.periods[t.periods.length - 2];
        const pct = prev.value ? (last.value - prev.value) / prev.value * 100 : null;
        if (pct != null && Math.abs(pct) >= 15) {
          const worsening = m.negative ? pct > 0 : pct < 0;
          const what = m.negative ? 'rose' : 'dropped';
          const dirWord = m.negative ? 'up' : 'down';
          if (worsening) {
            push(m.header + ' ' + what + ' ' + Math.abs(pct).toFixed(0) + '% MoM — investigate',
              'investigate', 'high',
              [m.header + ' moved from ' + KPI.interpreter.fmtFull(prev.value, t.unit) + ' (' + prev.period + ') to ' + KPI.interpreter.fmtFull(last.value, t.unit) + ' (' + last.period + ')',
               'A single-period move of this size is an investigation trigger, not yet a verdict — check the contributing ' + (S.dimensions[0] ? S.dimensions[0].header : 'dimensions') + ' before acting.']);
          } else {
            push(m.header + ' ' + (m.negative ? 'dropped' : 'rose') + ' ' + Math.abs(pct).toFixed(0) + '% MoM — understand what worked',
              'sustain', 'medium',
              [m.header + ' moved from ' + KPI.interpreter.fmtFull(prev.value, t.unit) + ' (' + prev.period + ') to ' + KPI.interpreter.fmtFull(last.value, t.unit) + ' (' + last.period + ')',
               'Identify the driver before it drifts — a move this steep usually has an identifiable cause.']);
          }
        }
      }
    }

    // 4. concentration risk
    const bd = results.find(r => r.kind === 'breakdown' && r.topShare != null);
    if (bd && bd.topShare > 60) {
      push('Concentration risk: ' + bd.top + ' alone is ' + bd.topShare.toFixed(0) + '% of ' + (bd.columns.metric || 'the metric'),
        'risk', 'medium',
        ['' + bd.top + ': ' + bd.topShare.toFixed(0) + '% of ' + bd.columns.metric + ' — any change to this single ' + (bd.columns.dimension || 'segment') + ' moves the whole number',
         'Diversification decisions are yours, but the exposure is measurable in this data.']);
    }

    // 5. engagement rate — SELF-RELATIVE: flagged only against this dataset's own
    //    history (latest period vs its own average), never a universal threshold
    const eng = results.find(r => r.kind === 'rate' && r.title && /engagement rate/i.test(r.title));
    if (eng && eng.periods && eng.periods.length >= 3) {
      const pairs = eng.periods.filter(p => p.rate != null);
      if (pairs.length >= 3) {
        const mean = pairs.reduce((a, p) => a + p.rate, 0) / pairs.length;
        const last = pairs[pairs.length - 1];
        if (last.rate < 0.6 * mean) {
          push('Engagement trailing its own average (' + last.rate.toFixed(2) + '% vs ' + mean.toFixed(2) + '% average)',
            'review', 'medium',
            ['engagement rate: ' + last.rate.toFixed(2) + '% in ' + last.period + ' vs the dataset\u2019s own ' + mean.toFixed(2) + '% average across ' + pairs.length + ' periods',
             'flagged against this dataset\u2019s own history — no external benchmark is assumed.']);
        }
      }
    }

    // 6. bounce rate — SELF-RELATIVE: rising relative to its own history only
    const bounce = results.find(r => r.kind === 'rate' && r.title && /bounce rate/i.test(r.title));
    if (bounce && bounce.periods && bounce.periods.length >= 3) {
      const pairs = bounce.periods.filter(p => p.rate != null);
      if (pairs.length >= 3) {
        const mean = pairs.reduce((a, p) => a + p.rate, 0) / pairs.length;
        const last = pairs[pairs.length - 1];
        if (last.rate > 1.4 * mean) {
          push('Bounce rate rising relative to its own history (' + last.rate.toFixed(1) + '% vs ' + mean.toFixed(1) + '% average)',
            'review', 'medium',
            ['bounce rate: ' + last.rate.toFixed(1) + '% in ' + last.period + ' vs the dataset\u2019s own ' + mean.toFixed(1) + '% average across ' + pairs.length + ' periods',
             'a rising share of undeliverable addresses can cost sender reputation — but this flag is the dataset\u2019s own trend, not an external benchmark.']);
        }
      }
    }

    // 7. stock gaps
    const stock = results.find(r => r.kind === 'stock');
    if (stock && stock.value > 0) {
      push('Restock ' + stock.value + ' item' + (stock.value === 1 ? '' : 's') + ' below reorder point',
        'restock', 'high',
        [stock.value + ' of ' + ctx.cleaned.rows.length + ' items are below reorder point (see the stock table for exact shortfalls)',
         'Shortfall = reorder_point − stock_qty per item; the largest gaps are visible in the analysis above.']);
    }

    return { proposals, gaps };
  }

  return { generate };
})();

// Review a cumulative set of observations. A choice never deletes the other sources.
export function resolveReview(result, selections, questionnaire, checkedKeys) {
  const fields = { ...result.fields }, selected = [...checkedKeys], reviews = {};
  for (const conflict of result.conflicts || []) {
    const choice = selections[conflict.field];
    if (!choice) throw new Error('Choose an answer for each disagreement, or select “Leave this unknown”.');
    const considered_ids = conflict.candidates.map(c => c.id).sort();
    const candidate = conflict.candidates.find(c => c.id === choice);
    if (candidate) {
      fields[conflict.field] = candidate;
      selected.push(conflict.field);
      reviews[conflict.field] = { considered_ids, selected_id: candidate.id, value: candidate.value };
      if (conflict.field === 'annual_consumption_kwh') {
        // Bind the billing period/fuel to the chosen document, not another year's bill.
        for (const key of ['consumption_full_year', 'energy_carrier']) {
          const linked = (result.observations || []).find(o => o.file_id === candidate.file_id && o.field === key);
          if (linked && !selections[key]) { fields[key] = linked; selected.push(key); }
        }
      }
    } else if (choice === 'answer' || choice === 'unknown') {
      reviews[conflict.field] = { considered_ids, selected_id: choice,
        value: choice === 'answer' ? questionnaire[conflict.field] ?? null : null };
    } else throw new Error('That evidence choice is no longer available. Please review the files again.');
  }
  const billChoice = selections.annual_consumption_kwh;
  const bill = fields.annual_consumption_kwh;
  if (billChoice === 'answer' || billChoice === 'unknown') {
    for (const key of ['consumption_full_year', 'energy_carrier']) {
      if (selections[key] && !['answer', 'unknown'].includes(selections[key])) {
        const chosen = fields[key];
        if (chosen && questionnaire[key] != null && chosen.value !== questionnaire[key]) throw new Error('Choose the matching bill before changing its fuel or period. You can also leave the consumption unknown.');
      }
      if (!selections[key] || selections[key] === 'answer') {
        for (let i = selected.length - 1; i >= 0; i--) if (selected[i] === key) selected.splice(i, 1);
      }
    }
  } else if (selected.includes('annual_consumption_kwh') && bill?.file_id) {
    for (const key of ['consumption_full_year', 'energy_carrier']) {
      const chosen = (result.observations || []).find(o => o.id === selections[key]);
      const linked = (result.observations || []).find(o => o.field === key && o.file_id === bill.file_id);
      if (chosen && linked && (key === 'consumption_full_year' ? chosen.file_id !== bill.file_id : chosen.value !== linked.value)) {
        throw new Error('Use the fuel and billing period from the same bill as the selected consumption.');
      }
      if (selections[key] === 'answer' && linked && questionnaire[key] != null && questionnaire[key] !== linked.value) {
        throw new Error('The selected bill has a different fuel or period. Choose its matching details or leave consumption unknown.');
      }
    }
  }
  // An explicit period choice always wins; unselected periods remain unknown.
  for (const c of result.conflicts || []) {
    const choice = selections[c.field], candidate = c.candidates.find(o => o.id === choice);
    if (candidate) fields[c.field] = candidate;
  }
  return { fields, selected: [...new Set(selected)], reviews };
}

export function clearUnknownAnswers(answers, reviews) {
  const next = { ...answers };
  for (const [key, review] of Object.entries(reviews)) {
    if (review.selected_id !== 'unknown') continue;
    if (key === 'annual_consumption_kwh') { next.amount = ''; next.unit = 'kwh'; next.consumption_full_year = 'unknown'; }
    else next[key] = typeof next[key] === 'string' && ['yes', 'no', 'unknown'].includes(next[key]) ? 'unknown' : '';
  }
  return next;
}

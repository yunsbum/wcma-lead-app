// Intro programs offered on the public booking page.
// price is in cents; price 0 = free (no payment step).
module.exports = [
  { id: 'adult',  name: 'Adult Intro',            price: 2900, dur: 45, tag: 'Ages 15+ · Private' },
  { id: 'tiny',   name: 'Tiny Tigers (Ages 4-6)', price: 1900, dur: 30, tag: 'Ages 4-6 · Group' },
  { id: 'junior', name: 'Junior Program (7-12)',  price: 2900, dur: 45, tag: 'Ages 7-12 · Group' },
  { id: 'free',   name: 'Free Trial Class',       price: 0,    dur: 45, tag: 'All ages · Free' }
];

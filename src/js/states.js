/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Indian states / UTs (2-letter codes used in forms,
   Firestore addresses and create-order). One copy (F-16).
   The <select> options in checkout.html / account.html use the same codes.
   ═══════════════════════════════════════════════════════════════ */

export const STATE_NAMES = {
  AN: 'Andaman & Nicobar', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam',
  BR: 'Bihar', CH: 'Chandigarh', CT: 'Chhattisgarh', DN: 'Dadra & Nagar Haveli',
  DD: 'Daman & Diu', DL: 'Delhi', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana',
  HP: 'Himachal Pradesh', JK: 'Jammu & Kashmir', JH: 'Jharkhand', KA: 'Karnataka',
  KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra',
  MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha',
  PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu',
  TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh', UT: 'Uttarakhand', WB: 'West Bengal',
};

/** Display name for a state code (falls back to the code itself). */
export function getStateName(code) {
  return STATE_NAMES[code] || code || '';
}

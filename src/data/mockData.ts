// Reference data for branch/zone information
// This data is sourced from the retailer_summary table in the database
export const ALL_BRANCHES = [
  'LMIT-HS-BARI',
  'LMIT-HS-BOLOGNA',
  'LMIT-HS-MILAN',
  'LMIT-HS-NAPLES',
  'LMIT-HS-PADOVA',
  'LMIT-HS-PALERMO',
  'LMIT-HS-ROME',
  'LMIT-HS-TORINO',
];

// Helper to normalize branch names (maps short names to DB format)
export const normalizeBranch = (branch: string) => {
  const mapping: Record<string, string> = {
    'Milan': 'LMIT-HS-MILAN',
    'Bologna': 'LMIT-HS-BOLOGNA',
    'Torino': 'LMIT-HS-TORINO',
    'Padova': 'LMIT-HS-PADOVA',
    'Rome': 'LMIT-HS-ROME',
    'Napoli': 'LMIT-HS-NAPLES',
    'Palermo': 'LMIT-HS-PALERMO',
    'Bari': 'LMIT-HS-BARI',
    'Naples': 'LMIT-HS-NAPLES',
  };
  return mapping[branch] || branch;
};

export const NORTH_REGION = ['LMIT-HS-MILAN', 'LMIT-HS-BOLOGNA', 'LMIT-HS-TORINO', 'LMIT-HS-PADOVA'];
export const SOUTH_REGION = ['LMIT-HS-ROME', 'LMIT-HS-NAPLES', 'LMIT-HS-PALERMO', 'LMIT-HS-BARI'];

// Zone mapping for branches - sourced from database
export const BRANCH_TO_ZONES: Record<string, string[]> = {
  'LMIT-HS-BARI': ['HS BARI SHOP CLOSED', 'HS BARI ZONE 1', 'HS BARI ZONE 2', 'HS BARI ZONE 3'],
  'LMIT-HS-BOLOGNA': ['HS BOLOGNA SHOP CLOSED', 'HS BOLOGNA ZONE 1', 'HS BOLOGNA ZONE 2', 'HS BOLOGNA ZONE 3'],
  'LMIT-HS-MILAN': ['HS MILANO SHOP CLOSED', 'HS MILANO ZONE 1', 'HS MILANO ZONE 2', 'HS MILANO ZONE 3', 'HS MILANO ZONE 4'],
  'LMIT-HS-NAPLES': ['HS NAPOLI SHOP CLOSED', 'HS NAPOLI ZONE 1', 'HS NAPOLI ZONE 2', 'HS NAPOLI ZONE 3', 'HS NAPOLI ZONE 4', 'HS NAPOLI ZONE 5', 'HS NAPOLI ZONE 6', 'HS NAPOLI ZONE 7'],
  'LMIT-HS-PADOVA': ['HS PADOVA SHOP CLOSED', 'HS PADOVA ZONE 1', 'HS PADOVA ZONE 2'],
  'LMIT-HS-PALERMO': ['HS PALERMO SHOP CLOSED', 'HS PALERMO ZONE 1', 'HS PALERMO ZONE 2', 'HS PALERMO ZONE 3'],
  'LMIT-HS-ROME': ['HS ROMA SHOP CLOSED', 'HS ROMA ZONE 1', 'HS ROMA ZONE 2', 'HS ROMA ZONE 3', 'HS ROMA ZONE 4', 'HS ROMA ZONE 5'],
  'LMIT-HS-TORINO': ['HS TORINO SHOP CLOSED', 'HS TORINOO ZONE 1', 'HS TORINOO ZONE 2', 'HS TORINOO ZONE 3'],
};

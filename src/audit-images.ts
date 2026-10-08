export const auditImagePaths: Record<string, string> = {
  'IMG-1008-001': '/images/audit/01.png',
  'IMG-1008-002': '/images/audit/02.png',
  'IMG-1008-003': '/images/audit/03.png',
  'IMG-1008-004': '/images/audit/04.png',
  'IMG-1008-005': '/images/audit/05.png',
  'IMG-1008-006': '/images/audit/06.png',
  'IMG-1008-007': '/images/audit/07.png',
  'IMG-0929-008': '/images/audit/08.png',
  'IMG-0919-009': '/images/audit/09.png',
  'IMG-0924-010': '/images/audit/10.png',
  'IMG-1004-021': '/images/audit/11.png',
  'IMG-0915-022': '/images/audit/12.png',
  'IMG-0929-023': '/images/audit/13.png',
  'IMG-0920-024': '/images/audit/14.png',
  'IMG-0921-025': '/images/audit/15.png',
  'IMG-0928-026': '/images/audit/16.png',
  'IMG-0928-027': '/images/audit/17.png',
  'IMG-0930-028': '/images/audit/18.png',
  'IMG-1001-029': '/images/audit/19.png',
  'IMG-1006-030': '/images/audit/20.png',
};

export const auditPhotoFiles = Array.from({ length: 20 }, (_, index) => `${String(index + 1).padStart(2, '0')}.png`);

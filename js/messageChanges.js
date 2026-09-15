// Curated public-source records, reviewed 2026-09-15. Dates never imply deployment.
export const changeReviewDate = '2026-09-15';
export const releaseIndex = 'https://www.elexon.co.uk/data-integration-platform/changes-releases/releases/list-of-dip-releases/';
export const changeRecords = [
  {
    id: 'DCR0019', title: 'Sender Unique Reference requirements', scope: 'S1',
    status: 'Approved release date; deployment not confirmed here', date: '2026-08-13', dateLabel: 'Approved release date',
    summary: 'Defines the permitted characters in Sender Unique References to reduce message validation failures. Review the detailed rule before changing reference generation.',
    relevance: 'This message includes S1.senderUniqueReference. DIPScope links this shared-header change to every interface that uses that field.',
    evidence: 'The release list gives 13 August 2026 as the approved date, but describes its release note as provisional. The change-request page contains a proposed timetable; neither is treated here as proof of deployment.',
    links: [{label:'DCR0019 proposal and timetable',url:'https://www.elexon.co.uk/data-integration-platform/change-requests/dcr0019/'},{label:'Elexon release list',url:releaseIndex}]
  },
  {
    id: 'CP1629', title: 'Enhanced IF-051 data refresh proposal', interfaces:['IF-051'],
    status: 'Rejected proposal', date:'2026-04', dateLabel:'Status reported',
    summary:'Elexon’s April 2026 Change Report records that SVG rejected CP1629. Its former target date must not be used as a go-live date.',
    relevance:'The proposal concerns IF-051. Earlier release material still references CP1629, so schema availability alone does not resolve its operational status.',
    evidence:'Rejection is recorded in the April report; subsequent replacement proposals and live activation have not been reconciled in this view.',
    links:[{label:'April 2026 Change Report',url:'https://www.elexon.co.uk/bsc/documents/change/report/april-2026-change-report/'},{label:'Earlier DIP release material',url:releaseIndex}]
  },
  {
    id:'CP1607', title:'IF-051 implementation-date review', interfaces:['IF-051'],
    status:'Historical recommendation; current outcome needs review', date:'2026-06-25', dateLabel:'Recommended revised date',
    summary:'The implementation assessment recommended moving CP1607 from 26 March to 25 June 2026 to align the data-refresh changes.',
    relevance:'This is planning evidence for IF-051, not confirmation that the current schema is operationally active.',
    evidence:'The assessment links its recommendation to CP1629, which was subsequently reported rejected. Check current implementation records before relying on either date.',
    links:[{label:'CP1607 implementation assessment',url:'https://www.elexon.co.uk/bsc/documents/change/cps/cp1601-cp1650/cp1607-implementation-assessment-phase/'}]
  }
];

export function relevantChanges(iface) {
  const hasSUR = Object.values(iface.technicalVariants || {}).some(v => v.common.some(n => n.key === 'S1' && n.fields.some(f => f.key === 'senderUniqueReference')));
  return changeRecords.filter(c => c.interfaces?.includes(iface.id.split('/')[0]) || (c.scope === 'S1' && hasSUR));
}

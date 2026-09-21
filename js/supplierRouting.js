// Business routing corrections are deliberately separate from the technical schema.
// A schema field named supplier, or an illustrative senderRoleID, is not routing evidence.
const registrationSource = 'https://bscdocs.elexon.co.uk/bsc-procedures/bscp706-supplier-meter-registration-service-for-mhhs-metering-systems';
const supplierSource = 'https://bscdocs.elexon.co.uk/bsc-procedures/bscp709-supplier-requirements-for-mhhs-metering-systems';

export const routingCorrections = {
  'IF-039/PUB-039': {
    receiver: 'Metering Service (MSA, MSS, UMSO), Data Service (ADS, SDS, UMSDS), Supplier (SUP), EES',
    source: registrationSource,
    reference: 'BSCP706 §4.2.2',
    note: 'Supplier receives the Customer Direct Contract response. The original local recipient list omitted Supplier and EES.'
  },
  'IF-043/PUB-043': {
    receiver: 'Metering Service, Data Service, Supplier (SUP), LDSO, BSC Central Systems, EES',
    source: registrationSource,
    reference: 'BSCP706 §4.2.2; BSCP709 §2.12',
    note: 'Supplier receives Connection Type updates. The original local DCC-only recipient description was incorrect.'
  },
  'IF-047/PUB-047': {
    receiver: 'All roles, including Supplier (SUP)',
    source: supplierSource,
    reference: 'BSCP709 §2.1 and §3.1',
    note: 'Supplier receives the ISD publication notification; the linked asset is retrieved separately.'
  }
};

export function classifySupplierRouting(sender, receiver) {
  const hasSupplier = value => /\bSUP\b|\bSuppliers?\b/i.test((value || '').replace(/Supplier Meter Registration (?:Service|Agent)/gi, 'SMRS'));
  if (!sender || !receiver || /not verified|unverified/i.test(`${sender} ${receiver}`)) return 'unverified';
  const send = hasSupplier(sender), receive = hasSupplier(receiver) || /\ball roles\b/i.test(receiver);
  return send && receive ? 'supplier_both' : send ? 'supplier_send' : receive ? 'supplier_receive' : 'none';
}

export function reconcileSupplierRouting(interfaces) {
  return interfaces.map(iface => {
    const correction = routingCorrections[iface.id];
    const receiver = correction?.receiver || iface.receiver;
    return {
      ...iface,
      receiver,
      supplier_type: classifySupplierRouting(iface.sender, receiver),
      supplierRoutingReview: correction ? {...correction, checkedDate: '2026-09-21'} : null
    };
  });
}

const COMMON_PREFIXES = new Set(['S0', 'S1', 'A0', 'D0', 'M0', 'M1', 'R0', 'R1']);

function keyFromBlockId(blockId = '') {
    return blockId.split('_')[0];
}

function blockIdForKey(key, blocks) {
    return Object.keys(blocks).find(id => keyFromBlockId(id) === key) || null;
}

function leaf(key, blocks, options = {}) {
    return {
        type: options.type || 'block',
        key,
        blockId: options.blockId || blockIdForKey(key.replace(/List$/, ''), blocks),
        required: options.required ?? null,
        note: options.note || null,
        label: options.label || null,
        source: options.source || null
    };
}

function list(key, blocks, options = {}) {
    return leaf(key, blocks, { ...options, type: 'list' });
}

function wrapper(key, children, options = {}) {
    return {
        type: options.type || 'wrapper',
        key,
        required: options.required ?? null,
        note: options.note || null,
        label: options.label || null,
        children
    };
}

function common(blocks, required = ['S0', 'S1', 'M0'], included = ['S0', 'S1', 'A0', 'D0', 'M0']) {
    const order = ['S0', 'S1', 'A0', 'D0', 'M0', 'M1', 'R0', 'R1'];
    const available = new Set(included);
    return order
        .filter(k => available.has(k) && blockIdForKey(k, blocks))
        .map(k => leaf(k, blocks, {
            required: required.includes(k),
            note: k === 'D0' ? 'Added/updated by the DIP on publication/egress.' : null
        }));
}

function genericStructure(iface, blocks) {
    const commonNodes = [];
    const customNodes = [];
    (iface.composition || []).forEach(comp => {
        if (comp.type !== 'block') return;
        const key = keyFromBlockId(comp.id);
        const node = { type: 'block', key, blockId: comp.id, required: null };
        (COMMON_PREFIXES.has(key) ? commonNodes : customNodes).push(node);
    });
    return {
        status: 'catalogue-fallback',
        label: 'Catalogue fallback',
        sourceNote: 'CommonBlock and CustomBlock are separated to match the DIP envelope, but this event-specific CustomBlock sequence has not yet been fully reconciled to the current Swagger.',
        common: commonNodes,
        custom: customNodes
    };
}

function structureOverlays(blocks) {
    const c = (required = ['S0', 'S1', 'M0']) => common(blocks, required);
    const req = (key) => leaf(key, blocks, { required: true });
    const opt = (key) => leaf(key, blocks, { required: false });

    return {
        'IF-001/PUB-001': {
            sourceNote: 'Current Elexon Interfaces/EventCodes Swagger. Official example payloads were used as a secondary cross-check.',
            variants: {
                InitialRegistration: {
                    status: 'swagger-verified', label: 'Swagger verified', common: c(),
                    custom: [
                        req('B013'), req('B002'), req('B004'), opt('B006'), req('B022'), req('B023'), req('B024'), req('B025'), req('B026'),
                        opt('B027'), opt('B029'), opt('B030'), opt('B031'), opt('B032'),
                        list('B035List', blocks, { required: false, label: 'Linked MPANs' }),
                        list('B037List', blocks, { required: false, label: 'Related MPANs' })
                    ]
                },
                ChangeOfSupplier: {
                    status: 'swagger-verified', label: 'Swagger verified', common: c(),
                    custom: [
                        req('B013'), req('B002'), req('B003'), req('B004'), opt('B005'), opt('B006'), req('B022'), req('B023'), req('B024'), req('B025'), req('B026'),
                        opt('B027'), opt('B029'), opt('B030'), opt('B031'), opt('B032'),
                        list('B035List', blocks, { required: false, label: 'Linked MPANs' }),
                        list('B037List', blocks, { required: false, label: 'Related MPANs' })
                    ]
                }
            }
        },
        'IF-002/PUB-002': {
            sourceNote: 'Current Elexon Swagger. Wrapper lists are preserved instead of flattening their member blocks.',
            variants: {
                GainMPANInfo: {
                    status: 'swagger-verified', label: 'Swagger verified', common: c(),
                    custom: [
                        req('B013'), opt('B005'), opt('B006'), req('B022'), req('B023'), req('B024'), req('B025'), req('B026'), opt('B027'), opt('B029'), opt('B030'), opt('B031'), opt('B032'),
                        wrapper('B905List', [leaf('B074', blocks), leaf('B075', blocks)], { type: 'wrapper-list', required: false, label: 'Installed meter details', note: 'Repeats per installed meter.' }),
                        wrapper('B907List', [leaf('B035', blocks), leaf('B036', blocks), leaf('B075', blocks)], { type: 'wrapper-list', required: false, label: 'Linked MPAN details', note: 'Repeating wrapper shown as a hierarchy rather than flattened blocks.' }),
                        wrapper('B908List', [leaf('B037', blocks), leaf('B038', blocks), leaf('B075', blocks)], { type: 'wrapper-list', required: false, label: 'Related MPAN details', note: 'Repeating wrapper shown as a hierarchy rather than flattened blocks.' })
                    ]
                }
            }
        },
        'IF-003/PUB-003': {
            sourceNote: 'Current Elexon Swagger defines three event-specific payload variants.',
            variants: {
                MSDeAppRM: {
                    status: 'swagger-verified', label: 'Swagger verified', common: c(),
                    custom: [req('B013'), req('B008'), req('B002'), opt('B095')]
                },
                DSDeAppRM: {
                    status: 'swagger-verified', label: 'Swagger verified', common: c(),
                    custom: [req('B013'), req('B009'), req('B002'), opt('B096')]
                },
                ReverseMigNotification: {
                    status: 'swagger-verified', label: 'Swagger verified', common: c(),
                    custom: [req('B013'), req('B094'), req('B002')]
                }
            }
        },
        'IF-013/PUB-013': {
            sourceNote: 'DIP hierarchy restored from the Swagger family: the settlement/defaulted consumption detail is represented by a repeating B920 wrapper.',
            variants: {
                ActivePowerDefaulted: {
                    status: 'schema-structure', label: 'Schema structure', common: c(),
                    custom: [
                        leaf('B043', blocks), leaf('B049', blocks), leaf('B067', blocks),
                        wrapper('B920List', [leaf('B050', blocks), leaf('B046', blocks), leaf('B048', blocks)], { type: 'wrapper-list', label: 'Defaulted settlement consumption', note: 'Wrapper hierarchy restored; field-level rules remain sourced from the local catalogue.' })
                    ]
                }
            }
        },
        'IF-014/PUB-014': {
            sourceNote: 'Current Swagger change history explicitly corrects this interface to a single B900 wrapper rather than B900List.',
            variants: {
                ActivePowerRejected: {
                    status: 'schema-structure', label: 'Schema structure', common: common(blocks, ['S0', 'S1', 'M0', 'R0'], ['S0', 'S1', 'A0', 'D0', 'M0', 'R0']),
                    custom: [leaf('B044', blocks), leaf('B067', blocks), wrapper('B900', [leaf('B045', blocks), leaf('B046', blocks), leaf('B047', blocks)], { label: 'Settlement consumption response' })]
                },
                ConsumptionOnDeEnergisedMPAN: {
                    status: 'schema-structure', label: 'Schema structure', common: common(blocks, ['S0', 'S1', 'M0', 'R0'], ['S0', 'S1', 'A0', 'D0', 'M0', 'R0']),
                    custom: [leaf('B044', blocks), leaf('B067', blocks), wrapper('B900', [leaf('B045', blocks), leaf('B046', blocks), leaf('B047', blocks)], { label: 'Settlement consumption response' })]
                }
            }
        },
        'IF-021/PUB-021': {
            sourceNote: 'Current official example shows B044, B067 and a repeating B900List containing measurement quantity and settlement-period data.',
            variants: {
                ActivePower: {
                    status: 'example-crosschecked', label: 'Swagger + example', common: c(),
                    custom: [
                        leaf('B044', blocks, { required: true }), leaf('B067', blocks, { required: true }),
                        wrapper('B900List', [leaf('B045', blocks), leaf('B046', blocks), leaf('B047', blocks)], { type: 'wrapper-list', required: true, label: 'Settlement-day consumption', note: 'Repeats by measurement quantity/settlement-day grouping.' })
                    ]
                },
                ReactivePower: {
                    status: 'schema-structure', label: 'Schema structure', common: c(),
                    custom: [
                        leaf('B044', blocks), leaf('B067', blocks),
                        wrapper('B900List', [leaf('B045', blocks), leaf('B046', blocks), leaf('B047', blocks)], { type: 'wrapper-list', label: 'Settlement-day consumption' })
                    ]
                }
            }
        },
        'IF-037/PUB-037': {
            sourceNote: 'The MSDeApp view is cross-checked to Elexon\'s official example. Other event variants currently fall back to the catalogue until their exact Swagger variant is mapped.',
            variants: {
                MSDeApp: {
                    status: 'example-crosschecked', label: 'Official example', common: c(),
                    custom: [
                        leaf('B013', blocks), leaf('B008', blocks),
                        { type: 'missing-block', key: 'B010', label: 'Incoming Metering Service', note: 'Present in the official DIP example but not currently represented in the local data-block catalogue.' },
                        leaf('B002', blocks)
                    ]
                }
            }
        },
        'IF-043/PUB-043': {
            sourceNote: 'Current official DIP example cross-check.',
            variants: {
                ConnectionTypeChange: { status: 'example-crosschecked', label: 'Official example', common: c(), custom: [leaf('B023', blocks, { required: true })] }
            }
        },
        'IF-044/PUB-044': {
            sourceNote: 'Current official DIP example cross-check. The received payload order is B023 then B026, which differs from the old catalogue display order.',
            variants: {
                MarketSegmentChange: { status: 'example-crosschecked', label: 'Official example', common: c(), custom: [leaf('B023', blocks, { required: true }), leaf('B026', blocks, { required: true })] }
            }
        }
    };
}

export function getDipStructure(iface, blocks, selectedEvent = null) {
    if (iface.technicalVariants) {
        const eventCodes = [...new Set([...Object.keys(iface.technicalVariants), ...(iface.eventCodes || [])])];
        const event = eventCodes.includes(selectedEvent) ? selectedEvent : eventCodes[0];
        const variant = iface.technicalVariants[event];
        return { ...(variant || genericStructure(iface, blocks)), event, eventCodes, hasExactVariant: !!variant };
    }
    const fallback = genericStructure(iface, blocks);
    const overlay = structureOverlays(blocks)[iface.id];
    const eventCodes = iface.eventCodes || [];
    const availableVariants = overlay?.variants || {};
    const firstMapped = eventCodes.find(e => availableVariants[e]) || Object.keys(availableVariants)[0];
    const event = selectedEvent && eventCodes.includes(selectedEvent) ? selectedEvent : (firstMapped || eventCodes[0] || null);

    if (!overlay || !availableVariants[event]) {
        return {
            ...fallback,
            event,
            eventCodes,
            sourceNote: overlay?.sourceNote || fallback.sourceNote,
            hasExactVariant: false
        };
    }

    return {
        ...availableVariants[event],
        event,
        eventCodes,
        sourceNote: overlay.sourceNote,
        hasExactVariant: true
    };
}

export function getStructureCoverage(iface, blocks) {
    if (iface.technicalVariants) return (iface.eventCodes || []).every(e => iface.technicalVariants[e]) ? 'full' : 'partial';
    const overlay = structureOverlays(blocks)[iface.id];
    if (!overlay) return 'catalogue-fallback';
    const mapped = new Set(Object.keys(overlay.variants || {}));
    const events = iface.eventCodes || [];
    return events.length && events.every(e => mapped.has(e)) ? 'full' : 'partial';
}

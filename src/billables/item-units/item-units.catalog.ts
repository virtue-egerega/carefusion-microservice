// The item units CareFusion seeds (PRD 15 §4.1): what items are sold and bought in, each with the kinds of
// item it belongs to. Hospitals add their own on top. The seeder adds missing ones only (insert-only).

type Kind =
    | 'REGISTRATION' | 'CONSULTATION' | 'LABORATORY' | 'RADIOLOGY' | 'PHARMACY'
    | 'PROCEDURE' | 'THEATRE' | 'ADMISSION' | 'CONSUMABLE' | 'OTHER';

export type SeededItemUnit = {
    name:            string;
    pluralName:      string;
    kinds:           Kind[];
    usedForSelling:  boolean;
    usedForPurchase: boolean;
};

const DRUG: Kind[] = ['PHARMACY'];
const STOCKED: Kind[] = ['PHARMACY', 'CONSUMABLE'];

const unit = (name: string, pluralName: string, kinds: Kind[], use: 'SELLING' | 'PURCHASE' | 'BOTH'): SeededItemUnit => ({
    name, pluralName, kinds, usedForSelling: use !== 'PURCHASE', usedForPurchase: use !== 'SELLING',
});

export const ITEM_UNIT_CATALOG: SeededItemUnit[] = [
    // drugs: what a patient is given
    unit('Tablet',      'Tablets',      DRUG,    'SELLING'),
    unit('Capsule',     'Capsules',     DRUG,    'SELLING'),
    unit('Card',        'Cards',        DRUG,    'SELLING'),   // a blister or strip
    unit('Ampoule',     'Ampoules',     DRUG,    'BOTH'),
    unit('Vial',        'Vials',        DRUG,    'BOTH'),
    unit('Suppository', 'Suppositories', DRUG,   'SELLING'),
    unit('Pessary',     'Pessaries',    DRUG,    'SELLING'),
    unit('Inhaler',     'Inhalers',     DRUG,    'BOTH'),
    unit('Millilitre',  'Millilitres',  DRUG,    'SELLING'),   // liquids measured out
    unit('Cup',         'Cups',         DRUG,    'PURCHASE'),  // loose tablets in bulk

    // drugs and consumables
    unit('Bottle',      'Bottles',      STOCKED, 'BOTH'),
    unit('Sachet',      'Sachets',      STOCKED, 'BOTH'),
    unit('Tube',        'Tubes',        STOCKED, 'BOTH'),
    unit('Jar',         'Jars',         STOCKED, 'BOTH'),
    unit('Tin',         'Tins',         STOCKED, 'BOTH'),
    unit('Pack',        'Packs',        STOCKED, 'BOTH'),
    unit('Piece',       'Pieces',       STOCKED, 'BOTH'),
    unit('Pair',        'Pairs',        STOCKED, 'BOTH'),
    unit('Roll',        'Rolls',        STOCKED, 'BOTH'),
    unit('Kit',         'Kits',         STOCKED, 'BOTH'),

    // what stock is bought in
    unit('Carton',      'Cartons',      STOCKED, 'PURCHASE'),
    unit('Box',         'Boxes',        STOCKED, 'PURCHASE'),
    unit('Case',        'Cases',        STOCKED, 'PURCHASE'),
    unit('Bag',         'Bags',         STOCKED, 'PURCHASE'),
    unit('Dozen',       'Dozens',       STOCKED, 'PURCHASE'),

    // services
    unit('Visit',       'Visits',       ['CONSULTATION'],              'SELLING'),
    unit('Test',        'Tests',        ['LABORATORY'],                'SELLING'),
    unit('Scan',        'Scans',        ['RADIOLOGY'],                 'SELLING'),
    unit('Procedure',   'Procedures',   ['PROCEDURE', 'THEATRE'],      'SELLING'),
    unit('Session',     'Sessions',     ['PROCEDURE', 'OTHER'],        'SELLING'),
    unit('Day',         'Days',         ['ADMISSION'],                 'SELLING'),
    unit('Night',       'Nights',       ['ADMISSION'],                 'SELLING'),
    unit('Hour',        'Hours',        ['THEATRE', 'ADMISSION'],      'SELLING'),
    unit('Service',     'Services',     ['REGISTRATION', 'OTHER'],     'SELLING'),   // a fee charged once
];

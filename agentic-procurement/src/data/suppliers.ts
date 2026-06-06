import type { Supplier } from '../types.js';

/**
 * A small mock supplier master-data set. In a real deployment this would be
 * backed by an ERP / supplier database (e.g. via MCP) — here it's static so the
 * prototype runs end-to-end with zero external dependencies.
 */
export const SUPPLIERS: Supplier[] = [
  {
    id: 'sup_northwind',
    name: 'Northwind Cloud Inc.',
    categories: ['software_saas'],
    countries: ['US'],
    certifications: ['SOC2', 'ISO27001', 'GDPR'],
    rating: 4.6,
    avgLeadTimeDays: 3,
    priceIndex: 1.05,
    existingVendor: true,
  },
  {
    id: 'sup_helios',
    name: 'Helios SaaS Group',
    categories: ['software_saas', 'marketing'],
    countries: ['US', 'IE'],
    certifications: ['SOC2', 'GDPR'],
    rating: 4.2,
    avgLeadTimeDays: 5,
    priceIndex: 0.92,
    existingVendor: false,
  },
  {
    id: 'sup_apex',
    name: 'Apex Hardware Systems',
    categories: ['hardware'],
    countries: ['US', 'MX'],
    certifications: ['ISO9001'],
    rating: 4.4,
    avgLeadTimeDays: 14,
    priceIndex: 0.98,
    diversityOwned: true,
    existingVendor: true,
  },
  {
    id: 'sup_terra',
    name: 'Terra Components Ltd.',
    categories: ['hardware', 'logistics'],
    countries: ['DE', 'PL'],
    certifications: ['ISO9001', 'ISO14001'],
    rating: 4.0,
    avgLeadTimeDays: 21,
    priceIndex: 0.89,
    existingVendor: false,
  },
  {
    id: 'sup_quill',
    name: 'Quill Professional Services',
    categories: ['professional_services'],
    countries: ['US', 'CA'],
    certifications: ['ISO27001'],
    rating: 4.7,
    avgLeadTimeDays: 7,
    priceIndex: 1.15,
    existingVendor: true,
  },
  {
    id: 'sup_brightside',
    name: 'Brightside Creative',
    categories: ['marketing'],
    countries: ['US', 'UK'],
    certifications: [],
    rating: 4.1,
    avgLeadTimeDays: 10,
    priceIndex: 1.0,
    diversityOwned: true,
    existingVendor: false,
  },
  {
    id: 'sup_summit',
    name: 'Summit Facilities Co.',
    categories: ['facilities'],
    countries: ['US'],
    certifications: ['ISO45001'],
    rating: 3.9,
    avgLeadTimeDays: 4,
    priceIndex: 0.95,
    existingVendor: true,
  },
  {
    id: 'sup_meridian',
    name: 'Meridian Logistics',
    categories: ['logistics'],
    countries: ['US', 'NL', 'SG'],
    certifications: ['ISO28000'],
    rating: 4.3,
    avgLeadTimeDays: 6,
    priceIndex: 1.02,
    existingVendor: true,
  },
];

export function findSuppliers(
  category: Supplier['categories'][number],
): Supplier[] {
  return SUPPLIERS.filter((s) => s.categories.includes(category));
}

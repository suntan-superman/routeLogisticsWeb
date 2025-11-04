/**
 * Default Materials by Service Category
 * Based on miFactotum_Service_Materials_List.md
 * Maps service categories to default materials that can be imported during onboarding
 */

export const DEFAULT_MATERIALS_BY_CATEGORY = {
  'General Handyman & Repair': [
    { name: 'Wood Screws (1")', category: 'Hardware', unit: 'box (100 ct)', costPerUnit: 5.50, retailPrice: 8.25, description: 'General fastening for furniture and repairs' },
    { name: 'Wall Anchors', category: 'Hardware', unit: 'pack (25 ct)', costPerUnit: 4.25, retailPrice: 6.50, description: 'Used for mounting shelves, TVs, mirrors' },
    { name: 'Silicone Caulk (Clear)', category: 'Sealants', unit: 'tube', costPerUnit: 6.75, retailPrice: 10.00, description: 'Waterproof sealing for windows and bathrooms' },
    { name: 'Wood Filler', category: 'Finishing', unit: 'tub (16 oz)', costPerUnit: 7.80, retailPrice: 11.50, description: 'Repairs holes and cracks before painting' },
    { name: 'Replacement Door Hinges', category: 'Hardware', unit: 'each', costPerUnit: 3.25, retailPrice: 5.00, description: 'Used for door and cabinet repair' },
    { name: 'Multi-Surface Cleaner', category: 'Cleaning Supplies', unit: 'bottle (32 oz)', costPerUnit: 4.50, retailPrice: 7.00, description: 'Used after general repairs and installation cleanup' }
  ],
  'Electrical & Lighting': [
    { name: 'Light Switch (Single Pole)', category: 'Electrical', unit: 'each', costPerUnit: 2.75, retailPrice: 4.50, description: 'Replacement for existing wall switches' },
    { name: 'Electrical Outlet (15A)', category: 'Electrical', unit: 'each', costPerUnit: 1.85, retailPrice: 3.00, description: 'Standard residential receptacle' },
    { name: 'Wire Connectors (Assorted)', category: 'Electrical', unit: 'jar (100 ct)', costPerUnit: 5.20, retailPrice: 8.00, description: 'For splicing electrical wiring' },
    { name: 'LED Bulb (60W Equivalent)', category: 'Lighting', unit: 'pack (4 ct)', costPerUnit: 8.90, retailPrice: 14.00, description: 'Energy-efficient bulb replacement' },
    { name: 'Electrical Tape', category: 'Electrical', unit: 'roll', costPerUnit: 2.50, retailPrice: 4.00, description: 'Insulation for connections' },
    { name: 'Smoke Detector Battery (9V)', category: 'Electrical', unit: 'each', costPerUnit: 1.25, retailPrice: 2.00, description: 'Battery replacement for detectors' }
  ],
  'Plumbing & Water Services': [
    { name: 'PVC Pipe (1")', category: 'Plumbing', unit: '10 ft', costPerUnit: 4.10, retailPrice: 6.50, description: 'Used for drain and water line repairs' },
    { name: 'Teflon Tape', category: 'Plumbing', unit: 'roll', costPerUnit: 1.50, retailPrice: 2.50, description: 'Thread sealing tape for pipe fittings' },
    { name: "Plumber's Putty", category: 'Plumbing', unit: 'tub (14 oz)', costPerUnit: 3.75, retailPrice: 6.00, description: 'Sealing for sinks and drains' },
    { name: 'Replacement Faucet Cartridge', category: 'Plumbing', unit: 'each', costPerUnit: 12.50, retailPrice: 20.00, description: 'Used for faucet repairs' },
    { name: 'Rubber Washers Assortment', category: 'Plumbing', unit: 'pack', costPerUnit: 4.00, retailPrice: 6.50, description: 'Used for leak prevention' },
    { name: 'Garbage Disposal Flange Kit', category: 'Plumbing', unit: 'each', costPerUnit: 15.75, retailPrice: 25.00, description: 'For disposal installation' }
  ],
  'Carpentry & Custom Work': [
    { name: 'Pine Trim (8 ft)', category: 'Lumber', unit: 'piece', costPerUnit: 7.80, retailPrice: 12.00, description: 'Used for baseboards and molding' },
    { name: 'Construction Adhesive', category: 'Adhesives', unit: 'tube', costPerUnit: 5.50, retailPrice: 8.50, description: 'Heavy-duty bonding for wood and drywall' },
    { name: 'Wood Screws (2")', category: 'Hardware', unit: 'box (100 ct)', costPerUnit: 6.25, retailPrice: 9.50, description: 'Common fastener for framing and trim' },
    { name: 'Sandpaper (Assorted Grits)', category: 'Finishing', unit: 'pack', costPerUnit: 4.75, retailPrice: 7.50, description: 'Surface prep for finishing' },
    { name: 'Wood Glue', category: 'Adhesives', unit: 'bottle (8 oz)', costPerUnit: 3.25, retailPrice: 5.00, description: 'For cabinetry and trim assembly' }
  ],
  'Painting & Finishing': [
    { name: 'Interior Paint (1 gal)', category: 'Paint', unit: 'gallon', costPerUnit: 28.00, retailPrice: 45.00, description: 'Standard interior latex paint' },
    { name: 'Exterior Paint (1 gal)', category: 'Paint', unit: 'gallon', costPerUnit: 32.00, retailPrice: 50.00, description: 'UV/weather-resistant finish' },
    { name: "Painter's Tape", category: 'Supplies', unit: 'roll', costPerUnit: 3.75, retailPrice: 6.00, description: 'For masking edges' },
    { name: 'Paint Roller Kit', category: 'Supplies', unit: 'kit', costPerUnit: 9.50, retailPrice: 15.00, description: 'Includes roller, tray, and cover' },
    { name: 'Wood Stain (1 qt)', category: 'Finishing', unit: 'quart', costPerUnit: 11.20, retailPrice: 18.00, description: 'For decks and furniture' },
    { name: 'Varnish (1 qt)', category: 'Finishing', unit: 'quart', costPerUnit: 12.75, retailPrice: 20.00, description: 'Protective topcoat for wood surfaces' }
  ],
  'Outdoor & Yard Services': [
    { name: 'Lawn Fertilizer (20 lb)', category: 'Lawn Care', unit: 'bag', costPerUnit: 18.00, retailPrice: 28.00, description: 'Used for lawn maintenance' },
    { name: 'Mulch (Cedar)', category: 'Landscaping', unit: 'bag (2 cu ft)', costPerUnit: 4.75, retailPrice: 7.50, description: 'Garden bed covering' },
    { name: 'Hedge Trimmer Line', category: 'Tools', unit: 'spool', costPerUnit: 8.25, retailPrice: 13.00, description: 'For trimmer maintenance' },
    { name: 'Gutter Screws', category: 'Hardware', unit: 'box (50 ct)', costPerUnit: 6.50, retailPrice: 10.00, description: 'For gutter repair' },
    { name: 'Exterior Wood Sealant', category: 'Finishing', unit: 'quart', costPerUnit: 14.25, retailPrice: 22.00, description: 'Used for deck or fence protection' }
  ],
  'Pool & Spa Services': [
    { name: 'Chlorine Tablets', category: 'Pool Chemicals', unit: 'bucket (50 lb)', costPerUnit: 85.00, retailPrice: 125.00, description: 'Water sanitation' },
    { name: 'Muriatic Acid', category: 'Pool Chemicals', unit: 'gallon', costPerUnit: 10.50, retailPrice: 16.00, description: 'pH balance control' },
    { name: 'Pool Shock Treatment', category: 'Pool Chemicals', unit: 'bag (1 lb)', costPerUnit: 4.25, retailPrice: 7.00, description: 'Water clarification' },
    { name: 'Filter Cartridges', category: 'Equipment', unit: 'each', costPerUnit: 22.00, retailPrice: 35.00, description: 'Pool filter replacement' },
    { name: 'Algaecide', category: 'Pool Chemicals', unit: 'quart', costPerUnit: 12.50, retailPrice: 20.00, description: 'Prevents algae growth' }
  ],
  'Pest Control Services': [
    { name: 'Insecticide Spray (Pyrethrin)', category: 'Chemicals', unit: 'gallon', costPerUnit: 38.00, retailPrice: 60.00, description: 'General pest treatment' },
    { name: 'Rodent Bait Blocks', category: 'Pest Control', unit: 'pail (8 lb)', costPerUnit: 45.00, retailPrice: 70.00, description: 'Used in bait stations' },
    { name: 'Glue Traps', category: 'Pest Control', unit: 'pack (10 ct)', costPerUnit: 6.25, retailPrice: 10.00, description: 'Monitoring and trapping' },
    { name: 'Termite Foam', category: 'Chemicals', unit: 'can (18 oz)', costPerUnit: 11.50, retailPrice: 18.00, description: 'Spot termite treatment' },
    { name: 'Dust Applicator', category: 'Tools', unit: 'each', costPerUnit: 8.90, retailPrice: 14.00, description: 'For applying powder treatments' }
  ],
  'HVAC & Appliance Services': [
    { name: 'Air Filter (16x20x1)', category: 'HVAC', unit: 'each', costPerUnit: 8.25, retailPrice: 13.00, description: 'Routine filter replacement' },
    { name: 'Flexible Duct Hose', category: 'HVAC', unit: '8 ft', costPerUnit: 11.50, retailPrice: 18.00, description: 'For vent connections' },
    { name: 'Thermostat (Programmable)', category: 'Electrical', unit: 'each', costPerUnit: 45.00, retailPrice: 70.00, description: 'Thermostat installation' },
    { name: 'Dryer Vent Kit', category: 'HVAC', unit: 'kit', costPerUnit: 18.00, retailPrice: 28.00, description: 'For vent cleaning/replacement' },
    { name: 'Drain Pan Tablets', category: 'HVAC', unit: 'pack', costPerUnit: 9.50, retailPrice: 15.00, description: 'Mold/mildew prevention in AC pans' }
  ],
  'Cleaning & Maintenance': [
    { name: 'All-Purpose Cleaner', category: 'Cleaning', unit: 'bottle (32 oz)', costPerUnit: 3.50, retailPrice: 5.50, description: 'General surface cleaning' },
    { name: 'Glass Cleaner', category: 'Cleaning', unit: 'bottle (32 oz)', costPerUnit: 3.25, retailPrice: 5.00, description: 'For windows and mirrors' },
    { name: 'Carpet Shampoo', category: 'Cleaning', unit: 'gallon', costPerUnit: 14.00, retailPrice: 22.00, description: 'Used for carpet cleaning' },
    { name: 'Degreaser', category: 'Cleaning', unit: 'gallon', costPerUnit: 11.50, retailPrice: 18.00, description: 'Kitchen and garage cleanup' },
    { name: 'Trash Bags (Heavy Duty)', category: 'Supplies', unit: 'box (50 ct)', costPerUnit: 7.25, retailPrice: 11.50, description: 'Waste collection' },
    { name: 'Mop & Bucket Set', category: 'Tools', unit: 'set', costPerUnit: 22.00, retailPrice: 35.00, description: 'Janitorial or office cleaning' }
  ],
  'Home Improvement & Renovation': [
    { name: 'Tile Adhesive', category: 'Construction', unit: 'bag (25 lb)', costPerUnit: 19.00, retailPrice: 30.00, description: 'Used for floor or backsplash installation' },
    { name: 'Grout (White)', category: 'Construction', unit: 'bag (10 lb)', costPerUnit: 11.00, retailPrice: 18.00, description: 'Tile finishing' },
    { name: 'Laminate Flooring (Box)', category: 'Flooring', unit: 'box (20 sq ft)', costPerUnit: 38.00, retailPrice: 60.00, description: 'Flooring replacement' },
    { name: 'Cabinet Handles', category: 'Hardware', unit: 'each', costPerUnit: 2.25, retailPrice: 3.50, description: 'For kitchen/bath updates' },
    { name: 'Countertop Sealant', category: 'Sealants', unit: 'tube', costPerUnit: 7.50, retailPrice: 12.00, description: 'Prevents water damage' }
  ],
  'Hauling & Miscellaneous': [
    { name: 'Contractor Trash Bags', category: 'Supplies', unit: 'box (50 ct)', costPerUnit: 9.75, retailPrice: 15.00, description: 'Junk removal' },
    { name: 'Ratchet Tie-Down Straps', category: 'Equipment', unit: 'pack (4 ct)', costPerUnit: 15.00, retailPrice: 24.00, description: 'For securing loads' },
    { name: 'Work Gloves', category: 'PPE', unit: 'pair', costPerUnit: 4.50, retailPrice: 7.00, description: 'Safety during hauling' },
    { name: 'Salt/Ice Melt', category: 'Seasonal', unit: 'bag (20 lb)', costPerUnit: 12.00, retailPrice: 19.00, description: 'Used for snow removal' },
    { name: 'Extension Cord (50 ft)', category: 'Electrical', unit: 'each', costPerUnit: 18.00, retailPrice: 28.00, description: 'For tools and lighting during projects' }
  ]
};

/**
 * Get default materials for selected service categories
 * @param {Array<string>} serviceCategoryNames - Array of service category names
 * @returns {Array<Object>} Array of material objects
 */
export const getDefaultMaterialsForCategories = (serviceCategoryNames = []) => {
  const allMaterials = [];
  const addedNames = new Set(); // Prevent duplicates if multiple categories have same material

  serviceCategoryNames.forEach(categoryName => {
    const materials = DEFAULT_MATERIALS_BY_CATEGORY[categoryName] || [];
    materials.forEach(material => {
      // Use name + category as unique key to prevent exact duplicates
      const uniqueKey = `${material.name}_${material.category}`;
      if (!addedNames.has(uniqueKey)) {
        allMaterials.push({ ...material, active: true });
        addedNames.add(uniqueKey);
      }
    });
  });

  return allMaterials;
};


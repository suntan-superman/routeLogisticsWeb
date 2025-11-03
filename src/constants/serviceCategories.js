// Service categories matching mobile app
// These categories and services are used across both web and mobile apps

export const SERVICE_CATEGORIES = [
  {
    id: 'general_handyman',
    name: 'General Handyman & Repair',
    services: [
      'Furniture assembly and installation',
      'Door and window repair or replacement',
      'Lock replacement and rekeying',
      'Drywall patching and repair',
      'Tile, grout, and caulking repair',
      'Mounting TVs, shelves, mirrors, and artwork',
      'Weatherproofing and insulation',
      'Fence and gate repair',
      'Mailbox installation or repair',
      'Deck repair and staining'
    ]
  },
  {
    id: 'electrical_lighting',
    name: 'Electrical & Lighting',
    services: [
      'Light fixture and ceiling fan installation',
      'Outlet and switch replacement',
      'Smoke and carbon monoxide detector installation',
      'Low-voltage wiring (doorbells, thermostats, security cameras)',
      'Landscape or exterior lighting maintenance'
    ]
  },
  {
    id: 'plumbing_water',
    name: 'Plumbing & Water Services',
    services: [
      'Faucet, toilet, and showerhead installation or repair',
      'Garbage disposal installation',
      'Leak detection and repair (minor)',
      'Drain cleaning (non-industrial)',
      'Water filter or softener system installation'
    ]
  },
  {
    id: 'carpentry_custom',
    name: 'Carpentry & Custom Work',
    services: [
      'Custom shelving or cabinetry',
      'Trim, baseboard, and molding installation',
      'Closet build-outs or organization systems',
      'Deck construction or repair',
      'Stair and railing repair'
    ]
  },
  {
    id: 'painting_finishing',
    name: 'Painting & Finishing',
    services: [
      'Interior and exterior painting',
      'Touch-ups and color matching',
      'Wallpaper removal or installation',
      'Staining and varnishing woodwork',
      'Garage floor or concrete coating'
    ]
  },
  {
    id: 'outdoor_yard',
    name: 'Outdoor & Yard Services',
    services: [
      'Lawn mowing and edging',
      'Hedge trimming and tree pruning',
      'Garden bed cleanup and mulching',
      'Sprinkler repair and adjustment',
      'Gutter cleaning and downspout flushing',
      'Pressure washing (driveways, siding, decks)',
      'Fence repair and painting'
    ]
  },
  {
    id: 'pool_spa',
    name: 'Pool & Spa Services',
    services: [
      'Routine pool cleaning and chemical balancing',
      'Filter and pump maintenance',
      'Tile cleaning and calcium removal',
      'Equipment inspection and repair'
    ]
  },
  {
    id: 'pest_control',
    name: 'Pest Control Services',
    services: [
      'Ant, spider, roach, and wasp treatments',
      'Rodent trapping and exclusion',
      'Termite inspection and spot treatment',
      'Bed bug and flea control',
      'Mosquito and outdoor pest management',
      'Wildlife removal (squirrels, raccoons, etc.)'
    ]
  },
  {
    id: 'hvac_appliance',
    name: 'HVAC & Appliance Services',
    services: [
      'Filter replacement and vent cleaning',
      'Thermostat installation',
      'Window or portable AC unit installation',
      'Dryer vent cleaning',
      'Appliance hookup (washer, dryer, dishwasher)'
    ]
  },
  {
    id: 'cleaning_maintenance',
    name: 'Cleaning & Maintenance',
    services: [
      'Move-in/move-out cleaning',
      'Window cleaning',
      'Carpet and upholstery cleaning',
      'Pressure washing (house exteriors, walkways)',
      'Trash removal and hauling',
      'Janitorial or office cleaning'
    ]
  },
  {
    id: 'home_improvement',
    name: 'Home Improvement & Renovation',
    services: [
      'Kitchen or bathroom updates',
      'Flooring installation (laminate, vinyl, tile)',
      'Countertop and backsplash replacement',
      'Small remodeling projects',
      'Garage organization systems'
    ]
  },
  {
    id: 'hauling_misc',
    name: 'Hauling & Miscellaneous',
    services: [
      'Junk removal and yard waste hauling',
      'Appliance or furniture delivery',
      'Moving assistance (load/unload)',
      'Snow removal',
      'Holiday light installation'
    ]
  }
];

// Get all services as a flat list
export const getAllServices = () => {
  return SERVICE_CATEGORIES.flatMap(category => 
    category.services.map(service => ({
      service,
      category: category.name,
      categoryId: category.id
    }))
  );
};

// Get services by category
export const getServicesByCategory = (categoryId) => {
  const category = SERVICE_CATEGORIES.find(cat => cat.id === categoryId);
  return category ? category.services : [];
};


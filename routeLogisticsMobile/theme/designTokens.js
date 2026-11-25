const DENSITIES = ['compact', 'comfortable', 'large'];

const scale = {
  compact: { title: 22, section: 16, body: 14, support: 12, button: 14, card: 12, sectionGap: 8, screenGap: 10 },
  comfortable: { title: 24, section: 18, body: 16, support: 14, button: 16, card: 16, sectionGap: 12, screenGap: 14 },
  large: { title: 28, section: 20, body: 18, support: 16, button: 18, card: 20, sectionGap: 16, screenGap: 18 },
};

function tokensForDensity(value = 'comfortable') {
  const density = DENSITIES.includes(value) ? value : 'comfortable';
  const size = scale[density];
  return {
    density,
    type: {
      title: { fontSize: size.title, lineHeight: Math.round(size.title * 1.25), fontWeight: '700' },
      section: { fontSize: size.section, lineHeight: Math.round(size.section * 1.32), fontWeight: '700' },
      body: { fontSize: size.body, lineHeight: Math.round(size.body * 1.45) },
      support: { fontSize: size.support, lineHeight: Math.round(size.support * 1.45) },
      button: { fontSize: size.button, lineHeight: Math.round(size.button * 1.3), fontWeight: '700' },
    },
    spacing: { xs: 4, sm: 8, md: size.sectionGap, lg: size.screenGap, card: size.card, section: size.sectionGap },
    radius: { card: density === 'compact' ? 14 : 18, control: 12, pill: 99 },
    icon: { inline: 18, section: 20, navigation: 22 },
    button: { horizontal: density === 'compact' ? 12 : 16, vertical: density === 'compact' ? 8 : 11 },
  };
}

const touchTarget = platform => platform === 'ios' ? 44 : 48;
module.exports = { DENSITIES, tokensForDensity, touchTarget };

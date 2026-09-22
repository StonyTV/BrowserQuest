const config = require('../../../shared/content/progression.json');

function status(experience) {
    const thresholds = config.thresholds;
    let index = 0;
    while (index + 1 < thresholds.length && experience >= thresholds[index + 1]) index++;
    const next = thresholds[index + 1];
    return {
        level: index + 1, maxLevel: thresholds.length,
        current: next === undefined ? 0 : experience - thresholds[index],
        required: next === undefined ? 0 : next - thresholds[index],
        healthBonus: index * config.healthPerLevel,
        damageBonus: index * config.damagePerLevel,
        defenseBonus: Math.floor(index / config.levelsPerDefense)
    };
}
function gain(profile, amount) {
    const before = status(profile.experience).level;
    const old = profile.experience;
    profile.experience = Math.min(config.thresholds.at(-1), old + amount);
    return { gained: profile.experience - old, levels: status(profile.experience).level - before };
}

module.exports = { status, gain };

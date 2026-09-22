define(['ui/dom'], function(dom) {
    return function(profile) {
        var progression = profile.progression, stats = profile.stats;
        var capped = progression.level === progression.maxLevel;
        var label = capped ? 'Niveau maximal atteint' : progression.current + ' / ' + progression.required + ' expérience';
        ['vitals-experience', 'character-experience'].forEach(function(id) {
            var bar = document.getElementById(id);
            bar.max = capped ? 1 : progression.required;
            bar.value = capped ? 1 : progression.current;
            bar.setAttribute('aria-valuetext', label);
        });
        document.getElementById('vitals-experience-label').textContent = capped ? 'Niveau maximal' : progression.current + ' / ' + progression.required + ' XP';
        document.getElementById('character-level').textContent = 'Niveau ' + progression.level;
        document.getElementById('character-experience-label').textContent = label;
        var root = document.getElementById('character-stats'); root.replaceChildren();
        [['Vitalité', profile.maxHitPoints, 'Points de vie maximum'],
         ['Puissance', stats.attackMin + '–' + stats.attackMax, 'Dégâts avant la défense de la cible'],
         ['Armure', stats.armorRank, 'Rang de protection de votre équipement'],
         ['Résistance', '+' + stats.defenseBonus, 'Réduction supplémentaire des dégâts reçus']].forEach(function(stat) {
            var block = dom.node('div'); block.title = stat[2];
            block.append(dom.node('dt', stat[0]), dom.node('dd', stat[1])); root.append(block);
        });
    };
});

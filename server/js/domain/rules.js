class RuleError extends Error {}
function requireRule(condition, message) {
    if (!condition) throw new RuleError(message);
}
function text(value, min, max, label) {
    requireRule(typeof value === 'string', label + ' invalide.');
    const result = value.trim();
    requireRule(result.length >= min && result.length <= max && !/[<>\x00-\x1f]/.test(result), label + ' invalide.');
    return result;
}
module.exports = { RuleError, requireRule, text };

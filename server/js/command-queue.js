// One ordered stream for this authoritative process, including disconnections.
// A failed write stops the stream: later commands must never use uncommitted state.
class CommandQueue {
    constructor(onError = () => {}) {
        this.tail = Promise.resolve();
        this.pending = 0;
        this.error = null;
        this.onError = onError;
    }
    run(command) {
        this.pending++;
        const result = this.tail.then(() => {
            if (this.error) throw this.error;
            return command();
        });
        this.tail = result.then(() => { this.pending--; }, error => {
            this.pending--;
            if (!this.error) { this.error = error; this.onError(error); }
        });
        return result;
    }
    drain() { return this.tail; }
}
module.exports = CommandQueue;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helloWorld = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
exports.helloWorld = (0, scheduler_1.onSchedule)("every 5 minutes", async (event) => {
    console.log("Hello from Firebase!");
});
//# sourceMappingURL=test.js.map
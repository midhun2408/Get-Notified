import { onSchedule } from "firebase-functions/v2/scheduler";

export const helloWorld = onSchedule("every 5 minutes", async (event) => {
  console.log("Hello from Firebase!");
});

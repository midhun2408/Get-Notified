---
description: How to deploy Firebase Functions
---

To deploy your Firebase Functions, follow these steps:

1. **Prerequisites**: Ensure you are logged in and have selected the correct project.
   ```powershell
   firebase login
   firebase use --add  # Follow the prompts to select your project if not already set
   ```

2. **Navigate to the functions directory**:
   ```powershell
   cd "e:\New folder (2)\Get-Notified\functions"
   ```

3. **Run the deployment command**:
   // turbo
   ```powershell
   npm run deploy
   ```
   This command will:
   - Run the linting check (if configured).
   - Build the project using `esbuild`.
   - Deploy only the functions to your Firebase project.

4. **View Logs**:
   After deployment, you can view the logs using:
   ```powershell
   npm run logs
   ```

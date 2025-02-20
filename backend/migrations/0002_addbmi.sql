-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserBodyData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "height" REAL NOT NULL,
    "bmi" REAL NOT NULL,
    "bodyFatPercentage" REAL NOT NULL,
    "gender" TEXT NOT NULL,
    CONSTRAINT "UserBodyData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserBodyData" ("bodyFatPercentage", "gender", "height", "id", "userId", "weight") SELECT "bodyFatPercentage", "gender", "height", "id", "userId", "weight" FROM "UserBodyData";
DROP TABLE "UserBodyData";
ALTER TABLE "new_UserBodyData" RENAME TO "UserBodyData";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

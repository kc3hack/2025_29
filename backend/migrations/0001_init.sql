-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameKana" TEXT NOT NULL,
    "cpuSerialNumber" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "UserLifecycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wakeUpTime" DATETIME NOT NULL,
    "sleepTime" DATETIME NOT NULL,
    CONSTRAINT "UserLifecycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserBodyData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "height" REAL NOT NULL,
    "bodyFatPercentage" REAL NOT NULL,
    "gender" TEXT NOT NULL,
    CONSTRAINT "UserBodyData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserLikeFood" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "food" TEXT NOT NULL,
    CONSTRAINT "UserLikeFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserLikeHobby" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hobby" TEXT NOT NULL,
    CONSTRAINT "UserLikeHobby_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserCalorieIntake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "calorie" INTEGER NOT NULL,
    "food" TEXT NOT NULL,
    CONSTRAINT "UserCalorieIntake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

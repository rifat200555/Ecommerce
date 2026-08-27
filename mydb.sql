CREATE DATABASE IF NOT EXISTS ecommerce;
USE ecommerce;

CREATE TABLE `USER` (
  UserID           INT AUTO_INCREMENT PRIMARY KEY,
  FullName         VARCHAR(100) NOT NULL,
  Email            VARCHAR(100) NOT NULL UNIQUE,
  PasswordHash     VARCHAR(255) NOT NULL,
  Phone            VARCHAR(20),
  ProfilePicture   VARCHAR(255),
  LastLogin        DATETIME NULL,
  RegistrationDate DATETIME DEFAULT CURRENT_TIMESTAMP,
  AverageRating    DECIMAL(3,2) DEFAULT 0
);

CREATE TABLE SELLER (
  UserID             INT PRIMARY KEY,
  StoreName          VARCHAR(100) NOT NULL,
  BusinessEmail      VARCHAR(100),
  BusinessPhone      VARCHAR(20),
  TradeLicenseNumber VARCHAR(50), 
  VerificationStatus VARCHAR(20) DEFAULT 'Pending',
  JoinedDate         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES `USER`(UserID)
);
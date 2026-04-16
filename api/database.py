# from sqlalchemy import create_engine
# from sqlalchemy.ext.declarative import declarative_base
# from sqlalchemy.orm import sessionmaker
# import os

# DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_E4sgvuRDJeY7@ep-flat-darkness-anqggkab-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

# # Fix Vercel Postgres URL format
# if DATABASE_URL.startswith("postgres://"):
#     DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# # Use check_same_thread only for SQLite
# connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# engine = create_engine(DATABASE_URL, connect_args=connect_args)
# SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# Base = declarative_base()


import os
from sqlalchemy import create_engine

# Check if we are running on Vercel
IF_VERCEL = os.environ.get("VERCEL")

if IF_VERCEL:
    # Use the writable /tmp directory for the database file
    SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/sql_app.db"
else:
    # Local development path
    SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
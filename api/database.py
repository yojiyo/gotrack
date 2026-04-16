import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Use your Neon URL (The one you commented out in your previous message)
# It is better to set this in Vercel Project Settings > Environment Variables as DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_E4sgvuRDJeY7@ep-flat-darkness-anqggkab-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require")

# Fix for Vercel/Heroku which sometimes uses 'postgres://'
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
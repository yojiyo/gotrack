from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form
from sqlalchemy.orm import Session
import models
from .database import SessionLocal, engine
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta, date
from contextlib import asynccontextmanager
import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url
import os
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
from base64 import b64encode
from typing import Optional
from urllib.parse import unquote
import uuid
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from collections import defaultdict

load_dotenv()
  
ZOOM_ACCOUNT_ID = os.getenv("ZOOM_ACCOUNT_ID")
ZOOM_CLIENT_ID = os.getenv("ZOOM_CLIENT_ID")
ZOOM_CLIENT_SECRET = os.getenv("ZOOM_CLIENT_SECRET")

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")

cloudinary.config( 
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
    api_key = os.getenv("CLOUDINARY_API_KEY"), 
    api_secret = os.getenv("CLOUDINARY_API_SECRET"), 
    secure=True
)

models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_users = [
            {"email": "admin@gocloud.com", "password": "admin", "role": "HR Manager"},
            {"email": "employee@gocloud.com", "password": "employee", "role": "Employee"}
        ]

        for user_data in seed_users:
            user = db.query(models.User).filter(models.User.email == user_data["email"]).first()
            if not user:
                new_user = models.User(
                    email=user_data["email"],
                    password=user_data["password"],
                    role=user_data["role"]
                )
                db.add(new_user)
                db.commit()
    finally:
        db.close()
    
    yield 

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.synthesisgroup.co", 
        "http://127.0.0.1:8000", # for local testing
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return FileResponse("index.html")

@app.get("/dashboard")
async def dashboard(): return FileResponse("dashboard.html")

@app.get("/candidates")
async def candidates(): return FileResponse("candidates.html")

@app.get("/employees")
async def employees(): return FileResponse("employees.html")

@app.get("/employee-profile")
async def employee_profile(): return FileResponse("employee-profile.html")

@app.get("/jobs")
async def jobs(): return FileResponse("jobs.html")

@app.get("/schedule")
async def schedule(): return FileResponse("schedule.html")

@app.get("/gallery")
async def gallery(): return FileResponse("gallery.html")

@app.get("/timelog")
async def timelog(): return FileResponse("timelog.html")

@app.get("/careers")
async def careers(): return FileResponse("careers.html")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class LoginRequest(BaseModel):
    email: str
    password: str

class LogRequest(BaseModel):
    user_email: str
    log_type: str


class PayrollGenerateRequest(BaseModel):
    employee_email: str
    salary_type: str  # hourly or monthly
    salary_rate: float
    period_start: Optional[str] = None  # YYYY-MM-DD
    period_end: Optional[str] = None    # YYYY-MM-DD
    deductions: Optional[float] = 0

@app.post("/login")
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    email = login_data.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if user and user.password == login_data.password:
        # Look up employee record if exists
        employee = db.query(models.Employee).filter(models.Employee.email == email).first()
        
        return {
            "status": "success",
            "message": "Login successful",
            "user": {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "employee_id": employee.id if employee else None,
                "full_name": employee.full_name if employee else user.email
            }
        }
    else:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

@app.post("/log-time")
async def log_time(data: LogRequest, db: Session = Depends(get_db)):
    now = datetime.now()
    new_log = models.TimeLog(
        user_email=data.user_email,
        log_type=data.log_type,
        timestamp=now.strftime("%I:%M %p"), 
        date=now.strftime("%b %d, %Y")     
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "time": new_log.timestamp}

@app.get("/get-logs/{email}")
async def get_logs(email: str, db: Session = Depends(get_db)):
    logs = db.query(models.TimeLog).filter(models.TimeLog.user_email == email).all()
    return logs


def _time_log_to_datetime(log_date: str, log_time: str):
    try:
        return datetime.strptime(f"{log_date} {log_time}", "%b %d, %Y %I:%M %p")
    except Exception:
        return None


def _compute_hours_for_logs(logs, start_date=None, end_date=None):
    grouped = defaultdict(dict)
    valid_dates = []

    for log in logs:
        try:
            d = datetime.strptime(log.date, "%b %d, %Y").date()
        except Exception:
            continue

        if start_date and d < start_date:
            continue
        if end_date and d > end_date:
            continue

        grouped[d][log.log_type] = log.timestamp
        valid_dates.append(d)

    total_hours = 0.0
    for d, day_logs in grouped.items():
        morning_in = day_logs.get("Morning In")
        afternoon_out = day_logs.get("Afternoon Out")
        morning_out = day_logs.get("Morning Out")

        if not morning_in:
            continue

        start_dt = _time_log_to_datetime(d.strftime("%b %d, %Y"), morning_in)
        end_dt = None
        if afternoon_out:
            end_dt = _time_log_to_datetime(d.strftime("%b %d, %Y"), afternoon_out)
        elif morning_out:
            end_dt = _time_log_to_datetime(d.strftime("%b %d, %Y"), morning_out)

        if start_dt and end_dt and end_dt > start_dt:
            total_hours += (end_dt - start_dt).total_seconds() / 3600

    return round(total_hours, 2), valid_dates


@app.post("/payroll/generate")
async def generate_payroll(data: PayrollGenerateRequest, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).filter(
        models.Employee.email == data.employee_email
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    salary_type = (data.salary_type or "").strip().lower()
    if salary_type not in ["hourly", "monthly"]:
        raise HTTPException(status_code=400, detail="salary_type must be hourly or monthly")
    if data.salary_rate < 0:
        raise HTTPException(status_code=400, detail="salary_rate cannot be negative")

    start_date = None
    end_date = None
    try:
        if data.period_start:
            start_date = datetime.strptime(data.period_start, "%Y-%m-%d").date()
        if data.period_end:
            end_date = datetime.strptime(data.period_end, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="period_start and period_end must use YYYY-MM-DD format")

    logs = db.query(models.TimeLog).filter(
        models.TimeLog.user_email == data.employee_email
    ).all()

    total_hours, valid_dates = _compute_hours_for_logs(logs, start_date, end_date)
    if start_date is None and valid_dates:
        start_date = min(valid_dates)
    if end_date is None and valid_dates:
        end_date = max(valid_dates)

    gross_pay = round((total_hours * data.salary_rate) if salary_type == "hourly" else data.salary_rate, 2)
    deductions = round(max(0, data.deductions or 0), 2)
    net_pay = round(max(0, gross_pay - deductions), 2)

    payroll = models.PayrollRecord(
        employee_id=employee.id,
        employee_email=employee.email,
        salary_type=salary_type,
        salary_rate=data.salary_rate,
        period_start=start_date.isoformat() if start_date else date.today().isoformat(),
        period_end=end_date.isoformat() if end_date else date.today().isoformat(),
        total_hours=total_hours,
        gross_pay=gross_pay,
        deductions=deductions,
        net_pay=net_pay
    )
    db.add(payroll)
    db.commit()
    db.refresh(payroll)

    return {
        "status": "success",
        "payroll_id": payroll.id,
        "employee_id": employee.id,
        "employee_name": employee.full_name,
        "employee_email": employee.email,
        "salary_type": payroll.salary_type,
        "salary_rate": payroll.salary_rate,
        "period_start": payroll.period_start,
        "period_end": payroll.period_end,
        "total_hours": payroll.total_hours,
        "gross_pay": payroll.gross_pay,
        "deductions": payroll.deductions,
        "net_pay": payroll.net_pay,
        "created_at": payroll.created_at.isoformat() if payroll.created_at else None
    }


@app.get("/payroll/history/{employee_email}")
async def get_payroll_history(employee_email: str, db: Session = Depends(get_db)):
    records = db.query(models.PayrollRecord).filter(
        models.PayrollRecord.employee_email == employee_email
    ).order_by(models.PayrollRecord.id.desc()).all()
    return records

@app.post("/jobs")
async def create_job(job_data: dict, db: Session = Depends(get_db)):
    existing_job = db.query(models.Job).filter(
        models.Job.title == job_data["title"],
        models.Job.department == job_data["department"],
        models.Job.location == job_data["location"]
    ).first()

    if existing_job:
        raise HTTPException(status_code=400, detail="This job already exists.")
    
    now_utc = datetime.utcnow().isoformat() 
    new_job = models.Job(
        title=job_data["title"],
        department=job_data["department"],
        location=job_data["location"],
        posted_at=now_utc, 
        status="Open"
    )
    db.add(new_job)
    log = models.ActivityLog(
        action="New Job Posted",
        details=f"Job for {new_job.title} in {new_job.department} is now live.",
        icon_type="blue"
    )
    db.add(log)
    db.commit()
    return {"message": "Job created successfully", "job": new_job}

@app.get("/get_jobs")
async def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).all()
    job_list = []
    
    for job in jobs:
        count = db.query(models.Candidate).filter(models.Candidate.role == job.title).count()
        
        job_list.append({
            "id": job.id,
            "title": job.title,
            "department": job.department,
            "location": job.location,
            "posted_at": job.posted_at,
            "status": job.status,
            "applicant_count": count
        })
    
    return {"jobs": job_list}

@app.patch("/jobs/{job_id}/toggle-status")
async def toggle_job_status(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "Closed" if job.status == "Open" else "Open"
    db.commit()
    return {"status": job.status}

@app.delete("/jobs/{job_id}")
async def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    log = models.ActivityLog(
        action="Job Removed", 
        details=f"The {job.title} position has been closed.", 
        icon_type="blue"
    )
    db.add(log)
    db.delete(job)
    db.commit()
    return {"message": "Job deleted successfully", "id": job_id}

@app.get("/get_job_stats")
async def get_job_stats(db: Session = Depends(get_db)):
    total_jobs = db.query(models.Job).count()
    
    last_month_limit = (datetime.utcnow() - timedelta(days=30)).isoformat()
    new_jobs_count = db.query(models.Job).filter(models.Job.posted_at >= last_month_limit).count()
    
    return {
        "total_jobs": total_jobs,
        "new_jobs": new_jobs_count
    }

class CandidateCreate(BaseModel):
    name: str
    role: str
    email: str = "N/A"
    phone: str = "N/A"
    location: str = "N/A"
    notes: str = ""

@app.post("/candidates")
async def create_candidate(data: CandidateCreate, db: Session = Depends(get_db)):
    new_candidate = models.Candidate(name=data.name, role=data.role, email=data.email or "N/A", phone=data.phone or "N/A", location=data.location or "N/A", notes=data.notes)
    db.add(new_candidate)
    
    log = models.ActivityLog(action="New Application", details=f"{new_candidate.name} applied for {new_candidate.role}.", icon_type="purple")
    db.add(log)
    
    db.commit()
    return {"message": "Candidate added"}

@app.get("/get_candidates")
async def get_candidates(db: Session = Depends(get_db)):
    candidates = db.query(models.Candidate).all()
    return {"candidates": candidates}

@app.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    db.query(models.Schedule).filter(models.Schedule.candidate_name == candidate.name).delete()
    db.query(models.CandidateActivityLog).filter(models.CandidateActivityLog.candidate_id == candidate_id).delete()  # ADD THIS
    
    db.delete(candidate)
    db.commit()
    return {"message": "Candidate and associated data deleted successfully"}

class StatusUpdate(BaseModel):
    status: str

@app.patch("/candidates/{candidate_id}/status")
async def update_candidate_status(candidate_id: int, data: StatusUpdate, db: Session = Depends(get_db)):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate: raise HTTPException(status_code=404)
    
    log = models.ActivityLog(action="Status Update", details=f"{candidate.name} moved to {data.status}.", icon_type="purple")
    db.add(log)
    
    candidate.status = data.status
    db.commit()
    return {"message": "Status updated"}

@app.get("/get_stats")
async def get_stats(db: Session = Depends(get_db)):
    now = datetime.now()
    this_month_limit = (now - timedelta(days=30)).isoformat()
    last_month_limit = (now - timedelta(days=60)).isoformat()
    this_week_limit = (now - timedelta(days=7)).isoformat()

    scheduled_interviews = db.query(models.Schedule).filter(
        models.Schedule.date != "Not Set",
        models.Schedule.date != "To be scheduled",
        models.Schedule.time != "Not Set"
    ).count()

    new_interviews_month = db.query(models.Schedule).filter(
        models.Schedule.date != "Not Set",
        models.Schedule.date != "To be scheduled"
    ).count()

    active_jobs = db.query(models.Job).filter(models.Job.status == "Open").count()
    new_jobs_count = db.query(models.Job).filter(models.Job.posted_at >= this_month_limit).count()
    
    total_candidates = db.query(models.Candidate).count()
    new_this_month = db.query(models.Candidate).filter(models.Candidate.created_at >= this_month_limit).count()
    prev_month_new = db.query(models.Candidate).filter(
        models.Candidate.created_at >= last_month_limit,
        models.Candidate.created_at < this_month_limit
    ).count()

    if prev_month_new > 0:
        cand_percent = round(((new_this_month - prev_month_new) / prev_month_new) * 100)
    else:
        cand_percent = 100 if new_this_month > 0 else 0

    hired_month_count = db.query(models.Candidate).filter(
        models.Candidate.status == "Hired",
        models.Candidate.created_at >= this_month_limit
    ).count()
    
    hired_week_count = db.query(models.Candidate).filter(
        models.Candidate.status == "Hired",
        models.Candidate.created_at >= this_week_limit
    ).count()

    return {
        "active_jobs": active_jobs,
        "new_jobs_count": new_jobs_count,
        "total_candidates": total_candidates,
        "candidate_trend_percent": cand_percent,
        "interviews": scheduled_interviews,
        "interviews_new_month": new_interviews_month,
        "hired_month": hired_month_count,
        "hired_new_week": hired_week_count
    }

@app.post("/schedules/auto")
async def auto_schedule(data: dict, db: Session = Depends(get_db)):
    existing = db.query(models.Schedule).filter(
        models.Schedule.candidate_name.ilike(data["name"].strip())
    ).first()
    
    if existing:
        existing.date = data.get("date", existing.date)
        existing.time = data.get("time", existing.time)
        existing.duration = data.get("duration", existing.duration)
        
        log = models.ActivityLog(
            action="Interview Updated", 
            details=f"Interview for {existing.candidate_name} updated to {existing.date}.", 
            icon_type="orange"
        )
        db.add(log)
        db.commit()
        return {"status": "updated"}
    else:
        new_sched = models.Schedule(
            candidate_name=data["name"],
            role=data["role"],
            date=data.get("date", "To be scheduled"),
            time=data.get("time", "TBD")
        )
        db.add(new_sched)
        
        log = models.ActivityLog(
            action="Interview Scheduled", 
            details=f"Interview for {new_sched.candidate_name} is ready to be set.", 
            icon_type="orange"
        )
        db.add(log)
        db.commit()
        return {"status": "created"}
    
@app.get("/get_schedules")
async def get_schedules(db: Session = Depends(get_db)):
    schedules = db.query(models.Schedule).all()
    result = []
    for s in schedules:
        # Look up the candidate's email and status based on their name
        candidate = db.query(models.Candidate).filter(models.Candidate.name.ilike(s.candidate_name.strip())).first()
        
        result.append({
            "id": s.id,
            "candidate_name": s.candidate_name,
            "role": s.role,
            "date": s.date,
            "time": s.time,
            "duration": s.duration,
            "status": candidate.status if candidate else "Scheduled",
            "email": candidate.email if candidate else "N/A",
            "response_status": s.response_status if s.response_status else "Pending",
            "zoom_link": s.zoom_link if s.zoom_link else None
        })
    return result

@app.post("/candidates/{candidate_id}/hire")
async def hire_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    job = db.query(models.Job).filter(models.Job.title == candidate.role).first()
    department_name = job.department if job else "To be assigned"

    today_date = datetime.now().strftime("%b %d, %Y")

    target_email = candidate.email if candidate.email != "N/A" else f"emp_{candidate.id}@gocloud.com"
    existing_user = db.query(models.User).filter(models.User.email == target_email).first()
    
    if not existing_user:
        new_user = models.User(email=target_email, password="change_me_123", role="Employee")
        db.add(new_user)

    existing_emp = db.query(models.Employee).filter(models.Employee.email == target_email).first()
    if not existing_emp:
        new_employee = models.Employee(
            full_name=candidate.name,
            email=target_email,
            department=department_name,
            position=candidate.role,
            join_date=today_date,
            salary=0,
            status="Pre-Employment",
            phone_number=candidate.phone or "N/A",
            address=candidate.location or "N/A"
        )
        db.add(new_employee)
        db.flush()  # flush so new_employee gets an ID without full commit
        emp_for_cycle = new_employee
    else:
        emp_for_cycle = existing_emp

    # Now safely create cycle record
    existing_cycle = db.query(models.EmployeeCycle).filter(
        models.EmployeeCycle.employee_id == emp_for_cycle.id
    ).first()

    if not existing_cycle:
        new_cycle = models.EmployeeCycle(
            employee_id=emp_for_cycle.id,
            full_name=candidate.name,
            position=candidate.role,
            department=department_name,
            stage="Pre-Employment"
        )
        db.add(new_cycle)

    log = models.ActivityLog(
        action="Candidate Hired", 
        details=f"{candidate.name} officially joined as {candidate.role}.", 
        icon_type="green"
    )
    db.add(log)
    candidate.status = "Hired"
    db.commit()
    return {"status": "success"}

@app.get("/get_employees")
async def get_employees(db: Session = Depends(get_db)):
    return db.query(models.Employee).all()

@app.delete("/employees/{employee_id}")
async def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    db.query(models.User).filter(models.User.email == employee.email).delete()
    
    db.delete(employee)
    db.commit()
    
    return {"message": "Employee and user account deleted successfully", "id": employee_id}

@app.get("/get_activities")
async def get_activities(db: Session = Depends(get_db)):
    return db.query(models.ActivityLog).order_by(models.ActivityLog.id.desc()).limit(5).all()

@app.get("/get_activities_all")
async def get_activities_all(db: Session = Depends(get_db)):
    return db.query(models.ActivityLog).order_by(models.ActivityLog.id.desc()).all()

@app.get("/get_departments")
async def get_departments(db: Session = Depends(get_db)):
    departments = db.query(models.Job.department).distinct().all()
    return [dept[0] for dept in departments if dept[0]]

@app.delete("/clear-logs/{email}")
async def clear_logs(email: str, db: Session = Depends(get_db)):
    db.query(models.TimeLog).filter(models.TimeLog.user_email == email).delete()
    db.commit()
    return {"status": "success", "message": "All time logs cleared for this user."}

@app.post("/upload-screenshot/{user_id}")
async def upload_screenshot(
    user_id: int, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    try:
        # Just verify the user exists — no employee check needed
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        upload_result = cloudinary.uploader.upload(
            file.file, 
            folder="gotrack_system/screenshots"
        )
        image_url = upload_result.get("secure_url")
        if not image_url:
            raise Exception("Cloudinary failed to return a secure_url")

        new_screenshot = models.Screenshot(
            employee_id=user.id,  # store against user.id directly
            image_url=image_url
        )
        db.add(new_screenshot)
        db.commit()

        return {"status": "success", "url": image_url}
        
    except Exception as e:
        db.rollback()
        print(f"UPLOAD ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-screenshots/{user_id}")
async def get_screenshots(user_id: int, db: Session = Depends(get_db)):
    return db.query(models.Screenshot).filter(
        models.Screenshot.employee_id == user_id
    ).order_by(models.Screenshot.created_at.desc()).all()

@app.delete("/screenshots/{screenshot_id}")
async def delete_screenshot(screenshot_id: int, db: Session = Depends(get_db)):
    # 1. Find the screenshot in the database
    screenshot = db.query(models.Screenshot).filter(models.Screenshot.id == screenshot_id).first()
    
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    try:
        # 2. Delete from Cloudinary
        # We need the public_id. If you only stored the URL, 
        # we extract it from the URL or ensure your DB has a public_id column.
        # Assuming your URL looks like: .../upload/v1234/public_id.jpg
        
        # If you don't store public_id separately, extract it from the URL:
        public_id = '/'.join(screenshot.image_url.split('/upload/')[1].split('/')[1:]).split('.')[0]
        
        cloudinary.uploader.destroy(public_id)

        # 3. Delete from Database
        db.delete(screenshot)
        db.commit()
        
        return {"message": "Successfully deleted from Cloudinary and Database"}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")
    
@app.get("/get-user-id/{email}")
async def get_user_id(email: str, db: Session = Depends(get_db)):
    decoded_email = unquote(email)  # converts %40 back to @
    user = db.query(models.User).filter(models.User.email == decoded_email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User not found: {decoded_email}")
    return {"user_id": user.id}

@app.post("/submit-application")
async def submit_application(
    name: str = Form(...),
    email: str = Form(...),
    role: str = Form(...),
    phone: str = Form(None),
    linkedin: str = Form(None),
    portfolio: str = Form(None),
    notes: str = Form(None),
    location: str = Form(None),
    resume: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Upload Resume to Cloudinary
    # Use resource_type="raw" for PDFs
    upload_result = cloudinary.uploader.upload(
        resume.file,
        resource_type="raw", 
        folder="resumes",
        format="pdf",
        public_id=f"{name.replace(' ', '_')}_{resume.filename}"
    )
    resume_link = upload_result.get("secure_url")

    # 2. Save everything to SQLite
    new_candidate = models.Candidate(
        name=name,
        role=role,
        email=email,
        phone=phone,
        location=location or "N/A",
        linkedin_url=linkedin,
        portfolio_url=portfolio,
        resume_url=resume_link,
        notes=notes,
        status="Applied"
    )
    db.add(new_candidate)
    
    # 3. Add to activity log
    log = models.ActivityLog(
        action="New Application", 
        details=f"{name} applied for {role}.", 
        icon_type="purple"
    )
    db.add(log)
    
    db.commit()
    return {"message": "Success", "resume_url": resume_link}

def get_zoom_access_token():
    try:
        credentials = b64encode(f"{ZOOM_CLIENT_ID}:{ZOOM_CLIENT_SECRET}".encode()).decode()
        response = requests.post(
            f"https://zoom.us/oauth/token?grant_type=account_credentials&account_id={ZOOM_ACCOUNT_ID}",
            headers={"Authorization": f"Basic {credentials}"}
        )
        data = response.json()
        return data.get("access_token")
    except Exception as e:
        print(f"Zoom token error: {e}")
        return None

def create_zoom_meeting(topic, start_time):
    try:
        token = get_zoom_access_token()
        if not token:
            print("Zoom: Failed to get access token")
            return None

        response = requests.post(
            "https://api.zoom.us/v2/users/me/meetings",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={
                "topic": topic,
                "type": 2,
                "start_time": start_time,
                "duration": 60,
                "timezone": "Asia/Manila",
                "settings": {
                    "host_video": True,
                    "participant_video": True,
                    "join_before_host": False
                }
            }
        )
        data = response.json()
        return data.get("join_url")
    except Exception as e:
        print(f"Zoom meeting creation error: {e}")
        return None

@app.post("/schedule/send-reschedule")
async def send_reschedule(data: dict, db: Session = Depends(get_db)):
    email = data.get("email")
    name = data.get("name")
    date_val = data.get("date")
    time_val = data.get("time")
    role = data.get("role")

    try:
        if any(x in time_val.upper() for x in ["AM", "PM"]):
            t_obj = datetime.strptime(time_val.strip(), "%I:%M %p")
        else:
            t_obj = datetime.strptime(time_val.strip(), "%H:%M")
        formatted_time = t_obj.strftime("%H:%M:%S")
        zoom_start_time = f"{date_val}T{formatted_time}"
    except Exception as e:
        print(f"Time parse error: {e}")
        zoom_start_time = f"{date_val}T12:00:00"

    try:
        zoom_link = create_zoom_meeting(f"Interview: {name} - {role}", zoom_start_time)
        if not zoom_link:
            zoom_link = "Meeting link will be sent shortly."
    except Exception as e:
        print(f"Zoom error: {e}")
        zoom_link = "Meeting link will be shared via calendar invitation."

    # Generate new token for this reschedule
    schedule_token = str(uuid.uuid4())
    schedule_record = db.query(models.Schedule).filter(
        models.Schedule.candidate_name == name
    ).first()
    if schedule_record:
        schedule_record.token = schedule_token
        schedule_record.response_status = "Pending"
        schedule_record.zoom_link = zoom_link
        db.commit()

    confirm_url = f"{BASE_URL}/interview/confirm/{schedule_token}"
    decline_url = f"{BASE_URL}/interview/decline/{schedule_token}"
    reschedule_url = f"{BASE_URL}/reschedule-request/{schedule_token}"

    message = MIMEMultipart("alternative")
    message["From"] = SENDER_EMAIL
    message["To"] = email
    message["Subject"] = f"Interview Rescheduled: {role} at Synthesis"

    html_body = f"""
    <html><body style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: auto; padding: 32px;">
        <h2 style="color: #d97706;">Interview Rescheduled</h2>
        <p>Hi <strong>{name}</strong>,</p>
        <p>Your interview for the <strong>{role}</strong> position at Synthesis has been rescheduled.</p>

        <div style="background:#f1f5f9; border-radius:8px; padding:16px; margin:24px 0;">
            <p style="margin:0;"><strong>📅 New Date:</strong> {date_val}</p>
            <p style="margin:8px 0 0;"><strong>🕐 New Time:</strong> {time_val}</p>
            <p style="margin:8px 0 0;"><strong>🔗 Zoom:</strong> <a href="{zoom_link}">{zoom_link}</a></p>
        </div>

        <p>Please confirm your attendance for the new schedule:</p>

        <div style="margin:24px 0;">
            <a href="{confirm_url}" style="background:#16a34a; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; margin-right:8px; display:inline-block;">
                ✅ Confirm Attendance
            </a>
            <a href="{decline_url}" style="background:#dc2626; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; margin-right:8px; display:inline-block;">
                ❌ Decline
            </a>
            <a href="{reschedule_url}" style="background:#d97706; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">
                🔄 Request Another Reschedule
            </a>
        </div>

        <p style="color:#64748b; font-size:13px;">We apologize for any inconvenience. If you have questions, please reply to this email.</p>
        <p>Best regards,<br><strong>The Synthesis Recruitment Team</strong></p>
    </body></html>
    """
    message.attach(MIMEText(html_body, "html"))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(message)
        server.quit()
        return {"status": "success"}
    except Exception as e:
        print(f"Reschedule mail error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/schedule/send-cancel")
async def send_cancel(data: dict):
    email = data.get("email")
    name = data.get("name")
    date_val = data.get("date")
    time_val = data.get("time")
    role = data.get("role")

    message = MIMEMultipart("alternative")
    message["From"] = SENDER_EMAIL
    message["To"] = email
    message["Subject"] = f"Interview Cancelled: {role} at Synthesis"

    html_body = f"""
    <html><body style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: auto; padding: 32px;">
        <h2 style="color: #dc2626;">Interview Cancelled</h2>
        <p>Hi <strong>{name}</strong>,</p>
        <p>We regret to inform you that your interview for the <strong>{role}</strong> position at Synthesis has been <strong>cancelled</strong>.</p>

        <div style="background:#fef2f2; border-left:4px solid #dc2626; border-radius:8px; padding:16px; margin:24px 0;">
            <p style="margin:0;"><strong>📅 Cancelled Date:</strong> {date_val}</p>
            <p style="margin:8px 0 0;"><strong>🕐 Cancelled Time:</strong> {time_val}</p>
        </div>

        <p>If you believe this was a mistake or would like to re-apply in the future, please don't hesitate to reach out to us.</p>
        <p>We appreciate your time and interest in joining Synthesis.</p>

        <p>Best regards,<br><strong>The Synthesis Recruitment Team</strong></p>
    </body></html>
    """
    message.attach(MIMEText(html_body, "html"))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(message)
        server.quit()
        return {"status": "success"}
    except Exception as e:
        print(f"Cancel mail error: {e}")
        return {"status": "error", "message": str(e)}
    
@app.post("/schedule/send-invite")
async def send_invite(data: dict, db: Session = Depends(get_db)):
    email = data.get("email")
    name = data.get("name")
    date_val = data.get("date")  # Expecting YYYY-MM-DD
    time_val = data.get("time")  # Expecting HH:MM or HH:MM AM/PM
    role = data.get("role")

    if not email or email == "N/A":
        return {"status": "skipped", "message": "No email provided for candidate"}

    # --- 1. Robust Time Formatting for Zoom ---
    # Zoom requires ISO 8601 format: YYYY-MM-DDTHH:MM:SS
    try:
        # Check if time contains AM/PM and convert to 24-hour format if necessary
        if any(x in time_val.upper() for x in ["AM", "PM"]):
            t_obj = datetime.strptime(time_val.strip(), "%I:%M %p")
        else:
            t_obj = datetime.strptime(time_val.strip(), "%H:%M")
        
        formatted_time = t_obj.strftime("%H:%M:%S")
        zoom_start_time = f"{date_val}T{formatted_time}"
    except Exception as e:
        print(f"Time Parsing Error: {e}. Using raw input.")
        zoom_start_time = f"{date_val}T12:00:00" # Fallback to noon if parsing fails

    # --- 2. Create Zoom Meeting ---
    try:
        # This calls the helper function we defined earlier
        zoom_link = create_zoom_meeting(f"Interview: {name} - {role}", zoom_start_time)
        if not zoom_link:
            zoom_link = "Meeting link will be sent shortly."
    except Exception as e:
        print(f"Zoom API Error: {e}")
        zoom_link = "Meeting link will be shared via calendar invitation."

    # --- 3. Prepare and Send Email ---
    message = MIMEMultipart()
    message["From"] = SENDER_EMAIL
    message["To"] = email
    message["Subject"] = f"Interview Invitation: {role} at Synthesis"

    # Generate and save token to schedule
    schedule_token = str(uuid.uuid4())
    schedule_record = db.query(models.Schedule).filter(
        models.Schedule.candidate_name == name
    ).first()
    if schedule_record:
        schedule_record.token = schedule_token
        schedule_record.response_status = "Pending"
        schedule_record.zoom_link = zoom_link
        db.commit()

    confirm_url = f"{BASE_URL}/interview/confirm/{schedule_token}"
    decline_url = f"{BASE_URL}/interview/decline/{schedule_token}"
    reschedule_url = f"{BASE_URL}/reschedule-request/{schedule_token}"

    html_body = f"""
    <html><body style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: auto; padding: 32px;">
        <h2 style="color: #2563eb;">Interview Invitation</h2>
        <p>Hi <strong>{name}</strong>,</p>
        <p>Thank you for your interest in the <strong>{role}</strong> position at Synthesis.
        We are excited to invite you for an interview!</p>

        <div style="background:#f1f5f9; border-radius:8px; padding:16px; margin:24px 0;">
            <p style="margin:0;"><strong>📅 Date:</strong> {date_val}</p>
            <p style="margin:8px 0 0;"><strong>🕐 Time:</strong> {time_val}</p>
            <p style="margin:8px 0 0;"><strong>🔗 Zoom:</strong> <a href="{zoom_link}">{zoom_link}</a></p>
        </div>

        <p>Please confirm your attendance by clicking one of the buttons below:</p>

        <div style="display:flex; gap:12px; margin:24px 0;">
            <a href="{confirm_url}" style="background:#16a34a; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; margin-right:8px;">
                ✅ Confirm Attendance
            </a>
            <a href="{decline_url}" style="background:#dc2626; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; margin-right:8px;">
                ❌ Decline
            </a>
            <a href="{reschedule_url}" style="background:#d97706; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">
                🔄 Request Reschedule
            </a>
        </div>

        <p style="color:#64748b; font-size:13px;">If you have any questions, please reply to this email.</p>
        <p>Best regards,<br><strong>The Synthesis Recruitment Team</strong></p>
    </body></html>
    """
    message.attach(MIMEText(html_body, "html"))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(message)
        server.quit()
        return {"status": "success", "zoom_link": zoom_link}
    except Exception as e:
        print(f"Mail Error: {e}")
        return {"status": "error", "message": str(e), "zoom_link": zoom_link}

@app.get("/employees/{employee_id}")
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Return as a dictionary to ensure JSON serialization
    return {
        "id": employee.id,
        "name": employee.full_name,
        "position": employee.position,
        "email": employee.email,
        "department": employee.department,
        "phone_number": employee.phone_number, 
        "address": employee.address,
        "hire_date": str(employee.hire_date) if hasattr(employee, 'hire_date') else "N/A",
        "salary": employee.salary if hasattr(employee, 'salary') else "N/A"
    }

class EmployeeUpdate(BaseModel):
    full_name: str
    email: str
    phone_number: Optional[str] = "N/A"
    address: Optional[str] = "N/A"
    position: Optional[str] = None # Keeping this so it doesn't break existing logic
    status: Optional[str] = None  # ADD THIS

@app.patch("/employees/{employee_id}")
async def update_employee(employee_id: int, data: EmployeeUpdate, db: Session = Depends(get_db)):
    # Use .filter().first() to ensure we get the record
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Update fields - make sure these match your models.py exactly
    employee.full_name = data.full_name
    employee.email = data.email
    employee.phone_number = data.phone_number
    employee.address = data.address
    if data.status:             
        employee.status = data.status
    
    try:
        db.commit()
        db.refresh(employee)

        # Also sync the candidate record if one exists with the same email
        candidate = db.query(models.Candidate).filter(
            models.Candidate.email == data.email
        ).first()
        if candidate:
            candidate.phone = data.phone_number
            candidate.location = data.address
            db.commit()

        return {"status": "success", "message": "Profile updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
class ChangePasswordRequest(BaseModel):
    email: str
    current_password: str
    new_password: str

@app.post("/change-password")
async def change_password(data: ChangePasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.password != data.current_password:
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password = data.new_password
    db.commit()
    return {"status": "success", "message": "Password changed successfully"}

class ResetPasswordRequest(BaseModel):
    email: str
    new_password: str

@app.post("/admin/reset-password")
async def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password = data.new_password
    db.commit()
    return {"status": "success", "message": "Password reset successfully"}

def send_admin_notification(candidate_name: str, role: str, response: str, date_val: str, time_val: str):
    subject_map = {
        "Confirmed": f"✅ {candidate_name} Confirmed Their Interview",
        "Declined": f"❌ {candidate_name} Declined Their Interview",
        "Reschedule Requested": f"🔄 {candidate_name} Requested a Reschedule"
    }
    body_map = {
        "Confirmed": f"{candidate_name} has confirmed their interview for the {role} position.\n\nDate: {date_val}\nTime: {time_val}",
        "Declined": f"{candidate_name} has declined their interview for the {role} position.\n\nYou may want to follow up or remove them from the pipeline.",
        "Reschedule Requested": f"{candidate_name} has requested to reschedule their interview for the {role} position.\n\nOriginal Schedule:\nDate: {date_val}\nTime: {time_val}\n\nPlease log in to GoTrack to set a new time."
    }
    try:
        message = MIMEMultipart()
        message["From"] = SENDER_EMAIL
        message["To"] = SENDER_EMAIL
        message["Subject"] = subject_map.get(response, f"Interview Response from {candidate_name}")
        message.attach(MIMEText(body_map.get(response, ""), "plain"))
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(message)
        server.quit()
    except Exception as e:
        print(f"Admin notification error: {e}")

def make_response_page(title: str, message: str, color: str):
    return f"""
    <html><body style="font-family:Arial,sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f8fafc; margin:0;">
        <div style="background:white; padding:48px; border-radius:16px; box-shadow:0 4px 24px rgba(0,0,0,0.1); text-align:center; max-width:480px;">
            <div style="font-size:56px; margin-bottom:16px;">{
                "✅" if color == "green" else "❌" if color == "red" else "🔄"
            }</div>
            <h2 style="color:{
                "#16a34a" if color == "green" else "#dc2626" if color == "red" else "#d97706"
            }; margin-bottom:12px;">{title}</h2>
            <p style="color:#64748b; font-size:15px; line-height:1.6;">{message}</p>
            <p style="color:#94a3b8; font-size:13px; margin-top:24px;">You can close this window.</p>
        </div>
    </body></html>
    """

from fastapi.responses import HTMLResponse

@app.get("/interview/confirm/{token}", response_class=HTMLResponse)
async def confirm_interview(token: str, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.token == token).first()
    if not schedule:
        return make_response_page("Invalid Link", "This confirmation link is invalid or has expired.", "red")
    schedule.response_status = "Confirmed"
    db.commit()
    send_admin_notification(schedule.candidate_name, schedule.role, "Confirmed", schedule.date, schedule.time)
    return make_response_page("Attendance Confirmed!", f"Thank you! Your interview on {schedule.date} at {schedule.time} has been confirmed. We look forward to speaking with you.", "green")

@app.get("/interview/decline/{token}", response_class=HTMLResponse)
async def decline_interview(token: str, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.token == token).first()
    if not schedule:
        return make_response_page("Invalid Link", "This confirmation link is invalid or has expired.", "red")
    schedule.response_status = "Declined"
    db.commit()
    send_admin_notification(schedule.candidate_name, schedule.role, "Declined", schedule.date, schedule.time)
    return make_response_page("Response Recorded", "We've noted that you won't be able to attend. Our team will be in touch with next steps.", "red")

@app.get("/interview/reschedule/{token}", response_class=HTMLResponse)
async def reschedule_request(token: str, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.token == token).first()
    if not schedule:
        return make_response_page("Invalid Link", "This confirmation link is invalid or has expired.", "red")
    schedule.response_status = "Reschedule Requested"
    db.commit()
    send_admin_notification(schedule.candidate_name, schedule.role, "Reschedule Requested", schedule.date, schedule.time)
    return make_response_page("Reschedule Requested", "Your request has been sent to the recruitment team. They will contact you shortly with a new schedule.", "orange")

@app.patch("/schedules/{schedule_id}/mark-done")
def mark_schedule_done(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.response_status = "Done"
    db.commit()
    return {"status": "done"}

@app.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(schedule)
    db.commit()
    return {"status": "deleted"}

@app.get("/candidates/{candidate_id}/logs")
def get_candidate_logs(candidate_id: int, db: Session = Depends(get_db)):
    logs = db.query(models.CandidateActivityLog)\
        .filter(models.CandidateActivityLog.candidate_id == candidate_id)\
        .order_by(models.CandidateActivityLog.timestamp.asc())\
        .all()
    return [{"status": l.status, "timestamp": l.timestamp.strftime("%b %d, %I:%M %p")} for l in logs]

@app.post("/candidates/{candidate_id}/logs")
def add_candidate_log(candidate_id: int, payload: dict, db: Session = Depends(get_db)):
    log = models.CandidateActivityLog(candidate_id=candidate_id, status=payload["status"])
    db.add(log)
    db.commit()
    return {"ok": True}

@app.get("/reschedule-request/{token}", response_class=HTMLResponse)
async def reschedule_request_page(token: str, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.token == token).first()
    if not schedule:
        return make_response_page("Invalid Link", "This link is invalid or has expired.", "red")
    return FileResponse("reschedule-request.html")

@app.post("/reschedule-request/{token}")
async def submit_reschedule_request(token: str, data: dict, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.token == token).first()
    if not schedule:
        raise HTTPException(status_code=404)
    schedule.response_status = "Reschedule Requested"
    schedule.requested_date = data.get("date")
    schedule.requested_time = data.get("time")
    db.commit()
    send_admin_notification(schedule.candidate_name, schedule.role, "Reschedule Requested", data.get("date"), data.get("time"))
    return {"status": "success"}

@app.get("/reschedule-info/{token}")
async def reschedule_info(token: str, db: Session = Depends(get_db)):
    schedule = db.query(models.Schedule).filter(models.Schedule.token == token).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Invalid token")
    return {
        "candidate_name": schedule.candidate_name,
        "role": schedule.role,
        "date": schedule.date,
        "time": schedule.time
    }

@app.patch("/employees/{employee_id}/status")
async def update_employee_status(employee_id: int, data: dict, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    employee.status = data.get("status", employee.status)
    db.commit()
    return {"status": "success", "new_status": employee.status}

# --- EMPLOYEE CYCLE ENDPOINTS ---

@app.get("/get_employee_cycles")
async def get_employee_cycles(db: Session = Depends(get_db)):
    cycles = db.query(models.EmployeeCycle).all()
    return [{
        "id": c.id,
        "employee_id": c.employee_id,
        "full_name": c.full_name,
        "position": c.position,
        "department": c.department,
        "stage": c.stage,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None
    } for c in cycles]

@app.patch("/employee_cycles/{cycle_id}/stage")
async def update_cycle_stage(cycle_id: int, data: dict, db: Session = Depends(get_db)):
    cycle = db.query(models.EmployeeCycle).filter(models.EmployeeCycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle record not found")
    cycle.stage = data.get("stage", cycle.stage)
    cycle.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "stage": cycle.stage}

@app.delete("/employee_cycles/{cycle_id}")
async def delete_cycle(cycle_id: int, db: Session = Depends(get_db)):
    cycle = db.query(models.EmployeeCycle).filter(models.EmployeeCycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle record not found")
    db.delete(cycle)
    db.commit()
    return {"status": "deleted"}

@app.patch("/employee_cycles/{cycle_id}/notes")
async def update_cycle_notes(cycle_id: int, data: dict, db: Session = Depends(get_db)):
    cycle = db.query(models.EmployeeCycle).filter(models.EmployeeCycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle record not found")
    cycle.notes = data.get("notes", cycle.notes)
    cycle.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success"}

app.mount("/static", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
    # uvicorn.run(app, host="0.0.0.0", port=8000)
    # change to 0.0.0.0 before deploying
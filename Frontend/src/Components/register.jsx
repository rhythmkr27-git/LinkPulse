import {useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import "./auth.css";

function Register(){
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function registerFunc(event){
    event.preventDefault();
    const data = new FormData(event.target);

    if(data.get("password") !== data.get("confirm")){
      setError("Passwords do not match");
      return;
    }
    setError("");
    setLoading(true);

    try{
      const res = await fetch(`${(import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/$/, "")}/auth/register`,{
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username: data.get("username"), email: data.get("email"), password: data.get("password")}),
      });

      const result = await res.json();

      if(!res.ok){
        const msg = result.error || result.msg || result.message || "Registration failed";
        setError(typeof msg === "string"? msg: JSON.stringify(msg));
        return;
      }

      navigate("/login");

    }catch(err){
      setError("Cannot reach the server. Try again in a moment.");
    }finally{
      setLoading(false);
    }
  }

  return(
    <div className="auth">
      <div className="form">
        <h1>Create account</h1>
        <p className="subtitle">Join LinkPulse and start shortening links</p>

        <form onSubmit={registerFunc}>
          <label htmlFor="username">Username</label>
          <input type="text" id="username" name="username" placeholder="Create username" autoComplete="username" minLength={3} required/>

          <label htmlFor="email">Email</label>
          <input type="email" id="email" name="email" placeholder="username@example.com" autoComplete="email" required/>

          <label htmlFor="password">Password</label>
          <div className="pass">
            
            <input type={showPass? "text":"password"} id="password" name="password" placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required/>
            <button type="button" className="show-pass" onClick={() => setShowPass((prev)=>!prev)}> 
              {showPass? "Hide": "Show"}
            </button>
          </div>

          <label htmlFor="confirm">Confirm password</label>
          <div className="pass">

            <input type={showConfirm? "text": "password"} id="confirm" name="confirm" placeholder="Re-enter password" autoComplete="new-password" required/>
            <button type="button" className="show-pass" onClick={() => setShowConfirm((prev) => !prev)}>
              {showConfirm? "Hide": "Show"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="switch-link">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
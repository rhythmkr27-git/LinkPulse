import {useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import "./auth.css";

function Login(){
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();


  async function submitFunc(event){
    event.preventDefault();
    const data = new FormData(event.target);

    setError("");
    setLoading(true);

    try{
      const res = await fetch(`${(import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/$/, "")}/auth/login`,{
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username: data.get("username"), password: data.get("password"),}),
      });

      const result = await res.json();

      if(!res.ok){
        setError(result.error || result.msg || "Login failed");
        return;
      }

      navigate("/dashboard"); 

    }catch(err){
      setError("Can't reach the server. Try again later.");
    }finally{
      setLoading(false);
    }
  }

  return(
    <div className="auth">
      <div className="form">
        <h1>Welcome Back!</h1>
        <p className="subtitle">Login to your LinkPulse account</p>

        <form onSubmit={submitFunc}>
          <label htmlFor="username">Username</label>
          <input type="text" id="username" name="username" placeholder="Enter username" autoComplete="username" required/>

          <label htmlFor="password">Password</label>
          <div className="pass">
            <input type={showPass? "text": "password"} id="password" name="password" placeholder="Enter password" autoComplete="current-password" required/>

            <button type="button" className="show-pass" onClick={()=> setShowPass((prev)=> !prev)}>
              {showPass? "Hide":"Show"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>{loading? "Logging in...": "Login"}</button>
        </form>

        <p className="switch-link">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
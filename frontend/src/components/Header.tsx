import './Header.css'
const Header=()=>{
    return(
        <>
 <div className="h-14 flex items-center px-4 border-b header">
        <span className="text-xl font-extrabold tracking-tight">Notescape</span>
        <input
          className="h-10 w-[920px] max-w-[60vw] rounded-full border border-slate-200 bg-white px-4 text-[15px] shadow-sm search-bar"
          placeholder="Search…"
          onChange={() => {
            /* noop for now */
          }}
        />
              </div>        

      </>
    )
}
export default Header;
# A real pseudo-terminal lets tests exercise Ink's raw input and alternate screen.
import os,sys,pty,fcntl,termios,struct,subprocess,select,json,signal
master,slave=pty.openpty()
def resize(cols,rows):
    fcntl.ioctl(master,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0))
resize(100,32)
child=subprocess.Popen(sys.argv[1:],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
os.close(slave)
try:
    while child.poll() is None:
        ready,_,_=select.select([master,sys.stdin],[],[],.1)
        if master in ready:
            try: data=os.read(master,65536)
            except OSError: break
            if not data: break
            os.write(sys.stdout.fileno(),data)
        if sys.stdin in ready:
            line=sys.stdin.readline()
            if not line: child.terminate();break
            event=json.loads(line)
            if 'resize' in event:
                resize(*event['resize']);os.kill(child.pid,signal.SIGWINCH)
            if 'input' in event: os.write(master,event['input'].encode())
    while True:
        try:
            ready,_,_=select.select([master],[],[],.05)
            if not ready: break
            data=os.read(master,65536)
            if not data: break
            os.write(sys.stdout.fileno(),data)
        except OSError: break
finally:
    if child.poll() is None: child.terminate()
    child.wait(timeout=5)
    os.close(master)
sys.exit(child.returncode)

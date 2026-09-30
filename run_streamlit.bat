@echo off
echo ==============================================================
echo Iniciando Motor Limnologico Python con Streamlit (CRISP-DM)
echo Dataset: Falling Creek Reservoir (fcr_oapat.csv - 1,960 obs)
echo ==============================================================
streamlit run streamlit_app.py --server.port 8501
pause

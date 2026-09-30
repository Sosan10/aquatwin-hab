"""Servicio de orquestación para alerta temprana de AquaTwin.

Límite de hilos de BLAS antes de cualquier import de numpy
----------------------------------------------------------
numpy, pandas y scikit-learn arrastran OpenBLAS, que al cargarse reserva
buffers por hilo (uno por núcleo). En esta máquina de 12 núcleos, importar los
tres juntos aborta de forma reproducible con:

    OpenBLAS error: Memory allocation still failed after 10 retries, giving up.

y el servicio no llega a arrancar. Limitar los hilos a 1 lo resuelve y no
cuesta nada aquí: las operaciones del OAPAT son matrices pequeñas (decenas o
cientos de filas), donde el paralelismo de BLAS no aporta y el coste está en la
orquestación, no en el álgebra.

Tiene que ejecutarse **antes** del primer `import numpy`, porque las variables
se leen al cargar la librería; por eso vive en el ``__init__`` del paquete y no
en un módulo concreto. Se respeta un valor ya definido en el entorno, para
poder subirlo en una máquina donde sí convenga.
"""

import os as _os

for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
             "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    _os.environ.setdefault(_var, "1")

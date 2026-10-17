SubProceso InicializarTablero(tablero)
    Definir i, j Como Entero;
    Para i <- 1 Hasta 3 Con Paso 1 Hacer
        Para j <- 1 Hasta 3 Con Paso 1 Hacer
            tablero[i,j] <- " ";
        FinPara;
    FinPara;
FinSubProceso;

SubProceso MostrarTablero(tablero)
    Definir i, j Como Entero;
    Escribir "";
    Para i <- 1 Hasta 3 Con Paso 1 Hacer
        Escribir Sin Saltar " ";
        Para j <- 1 Hasta 3 Con Paso 1 Hacer
            Escribir Sin Saltar tablero[i,j];
            Si j < 3 Entonces
                Escribir Sin Saltar " | ";
            FinSi;
        FinPara;
        Escribir "";
        Si i < 3 Entonces
            Escribir "-----------";
        FinSi;
    FinPara;
    Escribir "";
FinSubProceso;

SubProceso ganador <- HayGanador(tablero)
    Definir ganador Como Logico;
    Definir i Como Entero;
    ganador <- Falso;
    Para i <- 1 Hasta 3 Con Paso 1 Hacer
        Si tablero[i,1] <> " " && tablero[i,1] = tablero[i,2] && tablero[i,2] = tablero[i,3] Entonces
            ganador <- Verdadero;
        FinSi;
    FinPara;
    Para i <- 1 Hasta 3 Con Paso 1 Hacer
        Si tablero[1,i] <> " " && tablero[1,i] = tablero[2,i] && tablero[2,i] = tablero[3,i] Entonces
            ganador <- Verdadero;
        FinSi;
    FinPara;
    Si tablero[1,1] <> " " && tablero[1,1] = tablero[2,2] && tablero[2,2] = tablero[3,3] Entonces
        ganador <- Verdadero;
    FinSi;
    Si tablero[1,3] <> " " && tablero[1,3] = tablero[2,2] && tablero[2,2] = tablero[3,1] Entonces
        ganador <- Verdadero;
    FinSi;
FinSubProceso;

SubProceso lleno <- TableroLleno(tablero)
    Definir lleno Como Logico;
    Definir i, j, cont Como Entero;
    cont <- 0;
    Para i <- 1 Hasta 3 Con Paso 1 Hacer
        Para j <- 1 Hasta 3 Con Paso 1 Hacer
            Si tablero[i,j] <> " " Entonces
                cont <- cont + 1;
            FinSi;
        FinPara;
    FinPara;
    Si cont = 9 Entonces
        lleno <- Verdadero;
    SiNo
        lleno <- Falso;
    FinSi;
FinSubProceso;

Algoritmo TresEnRaya
    Definir tablero Como Caracter;
    Dimension tablero[3,3];
    Definir turno, fila, col, ultimo Como Entero;
    Definir ganador, empate Como Logico;
    InicializarTablero(tablero);
    turno <- 1;
    ganador <- Falso;
    empate <- Falso;
    ultimo <- 0;
    Mientras (~ganador) && (~empate) Hacer
        MostrarTablero(tablero);
        Si turno = 1 Entonces
            Escribir "Turno del Jugador 1 (X).";
        SiNo
            Escribir "Turno del Jugador 2 (O).";
        FinSi;
        Repetir
            Escribir "Ingrese fila (1-3): ";
            Leer fila;
            Escribir "Ingrese columna (1-3): ";
            Leer col;
            Si fila < 1 || fila > 3 || col < 1 || col > 3 || tablero[fila,col] <> " " Entonces
                Escribir "Movimiento invalido. Intente de nuevo.";
            FinSi;
        Hasta Que fila >= 1 && fila <= 3 && col >= 1 && col <= 3 && tablero[fila,col] = " ";
        Si turno = 1 Entonces
            tablero[fila,col] <- "X";
        SiNo
            tablero[fila,col] <- "O";
        FinSi;
        ultimo <- turno;
        ganador <- HayGanador(tablero);
        Si ~ganador Entonces
            empate <- TableroLleno(tablero);
        FinSi;
        Si turno = 1 Entonces
            turno <- 2;
        SiNo
            turno <- 1;
        FinSi;
    FinMientras;
    MostrarTablero(tablero);
    Si ganador Entonces
        Escribir "Gana el Jugador ", ultimo, "!";
    SiNo
        Escribir "Empate.";
    FinSi;
FinAlgoritmo;
